package com.printlly.customer

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

class PrintllyOpeningAudioPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PrintllyOpeningAudio(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

// A bounded local sound effect, not a media service or notification. All player
// operations run on one looper and every interruption releases focus/resources.
class PrintllyOpeningAudio(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
  private var player: MediaPlayer? = null
  private var preparation: Promise? = null
  private var prepared = false
  private var consumed = false
  private var foreground = true
  private var focusRequest: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change -> if (change != AudioManager.AUDIOFOCUS_GAIN) handler.post { release() } }
  private val policyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY || !allowed()) release()
    }
  }
  init {
    context.addLifecycleEventListener(this)
    val filter = IntentFilter().apply {
      addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
      addAction(AudioManager.RINGER_MODE_CHANGED_ACTION)
      addAction(NotificationManager.ACTION_INTERRUPTION_FILTER_CHANGED)
    }
    if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(policyReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    else context.registerReceiver(policyReceiver, filter)
  }
  override fun getName() = "PrintllyOpeningAudio"
  private fun allowed(): Boolean = foreground && audio.ringerMode == AudioManager.RINGER_MODE_NORMAL &&
    notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL && audio.getStreamVolume(AudioManager.STREAM_MUSIC) > 0

  @ReactMethod fun prepare(promise: Promise) = handler.post {
    release()
    consumed = false
    if (!allowed()) { Log.i("PrintllyOpeningAudio", "Opening audio suppressed by Android sound policy"); promise.resolve(false); return@post }
    preparation = promise
    try {
      val next = MediaPlayer()
      player = next
      next.setAudioAttributes(attributes)
      next.isLooping = false
      context.resources.openRawResourceFd(R.raw.printlly_opening_mix).use { asset -> next.setDataSource(asset.fileDescriptor, asset.startOffset, asset.length) }
      next.setOnPreparedListener { current ->
        if (player === current) { prepared = true; preparation?.resolve(true); preparation = null; Log.i("PrintllyOpeningAudio", "Opening audio prepared") }
      }
      next.setOnCompletionListener { release() }
      next.setOnErrorListener { _, _, _ -> release(); true }
      next.prepareAsync()
    } catch (_: Exception) { release() }
  }.let { Unit }

  @ReactMethod fun start(promise: Promise) = handler.post {
    if (!prepared || consumed || !allowed()) { release(); promise.resolve(false); return@post }
    consumed = true
    val granted = if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes)
        .setAcceptsDelayedFocusGain(false).setOnAudioFocusChangeListener(focusListener, handler).build()
      focusRequest = request
      audio.requestAudioFocus(request)
    } else audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { release(); promise.resolve(false); return@post }
    try { player?.start(); Log.i("PrintllyOpeningAudio", "Opening audio started once"); promise.resolve(true) } catch (_: Exception) { release(); promise.resolve(false) }
  }.let { Unit }

  @ReactMethod fun stop() { handler.post { release() } }
  private fun release() {
    preparation?.resolve(false); preparation = null
    prepared = false
    player?.let { current -> player = null; try { current.reset(); current.release() } catch (_: Exception) {} }
    if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { audio.abandonAudioFocusRequest(it) }
    else audio.abandonAudioFocus(focusListener)
    focusRequest = null
  }
  override fun onHostResume() { foreground = true }
  override fun onHostPause() { foreground = false; handler.post { release() } }
  override fun onHostDestroy() { foreground = false; handler.post { release() } }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    try { context.unregisterReceiver(policyReceiver) } catch (_: Exception) {}
    handler.post { release() }
    super.invalidate()
  }
}

