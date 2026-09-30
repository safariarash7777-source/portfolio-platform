import { CalendarDays, BookOpen, MessageSquare } from "lucide-react";
const steps = [
  {
    icon: CalendarDays,
    title: "شرایط نوبت را بخوانید",
    text: "موضوع وبینار، زمان تهران، هزینه و پایان دسترسی باید پیش از ثبت‌نام مشخص باشد.",
  },
  {
    icon: MessageSquare,
    title: "پرسش خود را مطرح کنید",
    text: "تجربه و هدف آموزشی شما به انتخاب موضوع و پرسش وبینار کمک می‌کند.",
  },
  {
    icon: BookOpen,
    title: "یادگیری را ادامه دهید",
    text: "محتوای منتشرشده و دسترسی‌های دوره از حساب عضو دنبال می‌شود. مشاوره مسیر جداگانه‌ای دارد.",
  },
];
export default function Method() {
  return (
    <section
      id="features"
      className="public-section public-surface"
      aria-labelledby="path-title"
    >
      <div className="public-container">
        <div className="public-section-heading">
          <div>
            <p className="public-eyebrow">جریان دوره</p>
            <h2 id="path-title">سه ماه همراهی چه مسیری دارد؟</h2>
          </div>
          <p>جزئیات اجرایی هر نوبت در صفحهٔ همان دوره اعلام می‌شود.</p>
        </div>
        <div className="public-three-grid">
          {steps.map((step, index) => (
            <article className="public-step" key={step.title}>
              <div className="public-step-icon">
                <step.icon size={23} aria-hidden />
                <span aria-hidden>{["۰۱", "۰۲", "۰۳"][index]}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
