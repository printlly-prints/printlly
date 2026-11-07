export default function AdminBrand() {
  return (
    <div className="flex items-center gap-3">
      <img src="/brand/paprout-mark.png" alt="" className="w-8 h-10 object-contain" />
      <div>
        <span className="block font-heading text-xl font-bold tracking-tight text-text-primary">Paprout<span className="text-primary">.</span></span>
        <span className="block text-xs text-text-secondary">Admin workspace</span>
      </div>
    </div>
  );
}
