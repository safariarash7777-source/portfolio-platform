import s from "@/components/admin/ArashDeskWorkspace.module.css";

export default function LoadingDesk() {
  return (
    <div dir="rtl" className={s.workspace} aria-busy="true" role="status">
      <h1>میز تحلیل آرش</h1>
      <p className={s.empty}>
        در حال خواندن دادهٔ بازار، گزارش‌ها و پژوهش موجود…
      </p>
    </div>
  );
}
