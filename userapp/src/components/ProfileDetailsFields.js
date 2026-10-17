import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "./ScreenFrame";
import Button from "./Button";
import FormField from "./FormField";
import { useTheme } from "../context/ThemeContext";
import { calendarCells, localDateKey, validDob } from "../utils/profileDetails";
import { typography, radius } from "../theme";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export default function ProfileDetailsFields({ value, onChange, disabled = false }) {
  const { colors, reducedMotion } = useTheme();
  const [open, setOpen] = useState(false), [mode, setMode] = useState("days");
  const today = new Date(), [year, setYear] = useState(today.getFullYear()), [month, setMonth] = useState(today.getMonth());
  const openCalendar = () => {
    const [y, m] = validDob(value.dob) ? value.dob.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
    setYear(y); setMonth(m - 1); setMode("days"); setOpen(true);
  };
  const control = { minHeight: 48, padding: 12, justifyContent: "center", alignItems: "center", borderRadius: radius.control, backgroundColor: colors.surface };
  const text = { ...typography.body, color: colors.textPrimary };
  const chooseDay = day => {
    const next = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (validDob(next)) { onChange({ ...value, dob: next }); setOpen(false); }
  };
  const moveMonth = delta => { const next = new Date(year, month + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth()); };
  return <View style={{ gap: 20 }}>
    <View style={{ gap: 8 }}>
      <Text style={{ ...typography.label, color: colors.textPrimary }}>Date of birth (optional)</Text>
      <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Choose date of birth${value.dob ? `, ${value.dob}` : ""}`} accessibilityState={{ disabled }} onPress={openCalendar} style={[control, { flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: colors.controlBorder }]}>
        <Text style={text}>{value.dob ? value.dob.split("-").reverse().join(" / ") : "DD / MM / YYYY"}</Text><Ionicons name="calendar-outline" color={colors.textSecondary} size={22} />
      </Pressable>
      {value.dob ? <Pressable disabled={disabled} onPress={() => onChange({ ...value, dob: "" })} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ ...text, color: colors.action }}>Remove date of birth</Text></Pressable> : null}
    </View>
    <FormField label="Contact email (optional)" value={value.contactEmail} onChangeText={contactEmail => onChange({ ...value, contactEmail })} disabled={disabled} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} hint="Saved to your profile. Does not change your sign-in email." />
    <Text style={{ ...typography.caption, color: colors.textSecondary }}>Your optional details are saved to your Printlly account.</Text>
    <Modal visible={open} onRequestClose={() => setOpen(false)} animationType={reducedMotion ? "none" : "fade"} presentationStyle="fullScreen">
      <ScreenFrame hideNavigation title="Date of birth" onBack={() => setOpen(false)} footer={<Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} />}>
        <Text style={{ ...text, marginBottom: 16 }}>Choose a year, month and day.</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose year" onPress={() => setMode("years")} style={[control, { flex: 1 }]}><Text style={text}>{year} ▾</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose month" onPress={() => setMode("months")} style={[control, { flex: 1 }]}><Text style={text}>{months[month]} ▾</Text></Pressable>
        </View>
        {mode === "years" ? <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{Array.from({ length: today.getFullYear() - 1899 }, (_, i) => today.getFullYear() - i).map(y => <Pressable key={y} accessibilityRole="button" accessibilityLabel={`Year ${y}`} onPress={() => { setYear(y); setMode("months"); }} style={[control, { width: "33.33%" }]}><Text style={text}>{y}</Text></Pressable>)}</View> : mode === "months" ? <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{months.map((label, m) => <Pressable key={label} accessibilityRole="button" onPress={() => { setMonth(m); setMode("days"); }} style={[control, { width: "50%" }]}><Text style={text}>{label}</Text></Pressable>)}</View> : <>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable disabled={year === 1900 && month === 0} accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={control}><Text style={text}>‹</Text></Pressable>
            <Text style={[text, { alignSelf: "center" }]}>{months[month]} {year}</Text>
            <Pressable disabled={year > today.getFullYear() || year === today.getFullYear() && month >= today.getMonth()} accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={control}><Text style={text}>›</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>{["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <Text key={i} style={[text, { width: "14.2857%", textAlign: "center", paddingVertical: 8 }]}>{day}</Text>)}{calendarCells(year, month).map((day, i) => {
            const date = day ? localDateKey(new Date(year, month, day)) : "", enabled = day && validDob(date);
            return <Pressable key={i} disabled={!enabled} accessibilityRole={day ? "button" : undefined} accessibilityLabel={day ? `${day} ${months[month]} ${year}` : undefined} accessibilityState={{ disabled: !enabled, selected: date === value.dob }} onPress={() => chooseDay(day)} style={{ width: "14.2857%", minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: date === value.dob ? colors.selection : undefined, borderRadius: 8 }}><Text style={[text, { opacity: enabled ? 1 : 0.3 }]}>{day || ""}</Text></Pressable>;
          })}</View>
        </>}
      </ScreenFrame>
    </Modal>
  </View>;
}



