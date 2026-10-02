/** Builds a reviewed, bounded local operations snapshot; no live member metrics. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const files={
 native:'./NATIVE-DEMO-ATTEMPT.json',demo:'../../../../../portfolio-product-direction/docs/ops/seasonal-program/p00-demo844-20261002/CURRENT.md',
 auth:'../../../../../portfolio-product-direction/docs/ops/seasonal-program/INCIDENT-AUTH-INTAKE-20261002.md',
 market:'../../../../../portfolio-product-direction/docs/ops/seasonal-program/INCIDENT-MARKET-VISIBILITY-INTAKE-20261002.md',
 baseline:'../../../../../portfolio-product-direction/docs/product-plan-v0.1/P00-BASELINE.md',
 contracts:'../../../../../portfolio-product-direction/docs/product-plan-v0.1/P00-CONTRACT-ISSUES.md',
 review:'./P08-REVIEW.md',recheck:'./P08-REVIEW-RECHECK.json',ci:'./P08-CI-RECEIPT.json',support:'./runtime/support-demo.json',
};
const sources=Object.fromEntries(Object.entries(files).map(([id,path])=>[id,{path:fileURLToPath(new URL(path,import.meta.url)),sha256:createHash('sha256').update(read(path)).digest('hex')}]));
const incidents=[
 {id:"native-browser-8444",title:"ورود دمو؛ نتیجه درخواست تأیید نشد",owner:"P00/P11",priority:"مسدودکننده پذیرش مستقل",status:"BLOCKED TOOL_BROWSER؛ علت نامعلوم",kind:"مشاهده مستقل روی داده ساختگی",environment:"demo8444 @65c215b",evidence:"native",next:"بازیابی کنترل مرورگر، سپس مسیر A و منع B؛ وضعیت HTTP نامعلوم"},
 {id:'auth-intake-20261002',title:'پاسخ Auth قابل‌خواندن نیست',owner:'P01',priority:'بالا؛ پیشنهاد P11',status:'گزارش تاریخی؛ وضعیت فعلی نامعلوم',kind:'شاهد لاگ واقعی گزارش‌شده',environment:'Production main51fd066',evidence:'auth',next:'علت/رفع و محیط نسخه ترکیبی با شاهد تازه بررسی شود'},
 {id:'market-intake-20261002',title:'نمایش داده بازار؛ گزارش آرش',owner:'P02',priority:'بالا؛ پیشنهاد P11',status:'گزارش کاربر؛ علت نامعلوم',kind:'گزارش مستقیم کاربر',environment:'Production؛ مسیر دقیق نامعلوم',evidence:'market',next:'مسیر/درخواست مشخص و شاهد تازه از مالک داده'},
 {id:'p08-overrun',title:'dispatch رزرو قبلی پس از overrun',owner:'P08',priority:'مسدودکننده پذیرش fixture',status:'رفع و بازبینی محدود شد',kind:'اجرای مستقل مصنوعی',environment:'fixture روی commit2ca3058/e4419f9',evidence:'review',next:'پذیرش کامل ledger و authority سرور جداست'},
 {id:'p08-lineage',title:'نگاشت دریافت با پرونده نامرتبط',owner:'P08',priority:'مسدودکننده پذیرش fixture',status:'رفع و بازبینی محدود شد',kind:'اجرای مستقل مصنوعی',environment:'fixture روی commit2ca3058/e4419f9',evidence:'recheck',next:'receipt واقعی و مجوز pre/post در محیط هدف'},
 {id:'p08-ci-registration',title:'آزمون‌های ثبت‌نشده در test:core',owner:'P08/P00',priority:'گیت CI',status:'رفع؛ CI همان head موفق',kind:'اجرای CI واقعی روی fixture مخزن',environment:'GitHub e4419f9',evidence:'ci',next:'موفقیت CI پذیرش سرویس مشتری نیست'},
 {id:'human-acceptance',title:'فهم مالی و استفاده واقعی عضو',owner:'آرش/P00/P03/P04',priority:'گیت انسانی',status:'OPEN',kind:'پذیرش انسانی انجام‌نشده',environment:'sandbox/پایلوت پیشنهادی',evidence:'baseline',next:'فرد کم‌تخصص و محتوای معلم تأیید کند؛ تعداد/موعد باز'},
];
const capabilities=[
 ['P00','یک نسخه قابل‌آزمایش با schema و مالک معلوم','دموی65c215b و receipt تازه؛ صفحه SHA مستقل دیده شد','G0/G1؛ پذیرش مستقل مرورگر BLOCKED','P00','baseline'],
 ['P01','ورود، بازیابی و دسترسی واقعی عضو A؛ منع B','فرم native8444 ارسال؛ نتیجه ورود در مرورگر تأیید نشد','G1/G2 و policy/provider','P01','baseline'],
 ['P02','داده معتبر، null/واحد و سهمیه پایدار','قرارداد/کد؛ سهمیه و دو چرخه زنده باز','G2؛ مجوز provider/priorUsage/reset','P02','contracts'],
 ['P03','شروع عضو، نیازسنجی، درس و وبینار مجاز','داده native8444 ثابت؛ مسیر عضو به علت مرورگر NOT_RUN','G2/G3؛ سه مرور انسانی OPEN','P03','contracts'],
 ['P04','سبد و تصویر مالی معتبر و سابقه مشترک','کد موجود؛ شاهد این نوبت عضو ترکیبی نداریم','G2؛ فهم انسانی OPEN','P04','baseline'],
 ['P05','اتصال تلگرام و نسخه/سبد یکسان','adapter/preview؛ انتقال واقعی و freeze باز','G2/G3؛ policy-block محفوظ','P05','contracts'],
 ['P06','تصمیم با مخرج/اندازه و بازتوازن صحیح','قرارداد اندازه و اعتبار هنوز DRAFT','G2/G3؛ تأیید آرش OPEN','P06/P07','contracts'],
 ['P07','پژوهش دستی تا انتشار، اصلاح و پس‌گرفتن','publication موجود؛ افزونه validity هنوز DRAFT','G2/G3؛ سه گردش واقعی OPEN','P07','contracts'],
 ['P08','پاسخ با منبع و ارجاع/مصرف قابل‌ردیابی','دو یافته fixture مستقل بسته؛ CI موفق','G2/G3؛ مدل/هزینه/پاسخ واقعی OPEN','P08','review'],
 ['P09','شریک، انتساب، گزارش و وصول قابل‌اثبات','قرارداد و نمونه آفلاین؛ داده واقعی در این snapshot نیست','G2/G4؛ قرارداد واقعی OPEN','P09','baseline'],
 ['P10','جریان نقد، بدهی و هدف قابل‌فهم','وابسته به پذیرشP04؛ این snapshot بازبینی کد ندارد','G2/G4؛ صحت و فهم انسانی OPEN','P10','baseline'],
 ['P11','سنجش بدون PII، پیگیری، خطا و پذیرش مسیر','24 بررسی کتابخانه و receipt؛ سفر native BLOCKED','G2/G3/G4؛ نام پاسخ‌گو/SLA/پایلوت OPEN','P11','support'],
].map(([packageId,capability,evidenceState,gates,owner,evidence])=>({packageId,capability,evidenceState,gates,owner,evidence,human:'OPEN؛ هیچ پذیرش انسانی از این snapshot استنتاج نشود'}));
const support=JSON.parse(read(files.support));
const supportRows=[{id:'fixture-received',state:'received',result:support.received.status,eventAction:support.received.event.dimensions.action,kind:'اجرای مصنوعی با ساعت قطعی',firstResponse:'نامعلوم',sla:'مصوب نیست',owner:'P08/P11؛ پاسخ‌گوی انسانی تعیین‌نشده',next:'receipt/authority server نیاز شاهد واقعی دارد'},{id:'fixture-revoke',state:'revoked during projection',result:support.revoked.code,eventAction:'هیچ رخداد',kind:'اجرای مصنوعی با ساعت قطعی',firstResponse:'نامعلوم',sla:'مصوب نیست',owner:'P01/P08/P11',next:'سؤال یا پیام واقعی ارسال نشده'}];
const source=(label,ids,definitions)=>({label,files:ids.map(i=>sources[i].path),filters:['Snapshot bounded to source files read on 2026-10-02; current operational state is not polled','Synthetic executions and reported Production incidents are explicitly classified per row'],metricDefinitions:definitions,evidenceFlow:ids.map(i=>({title:i,detail:`Read local source ${sources[i].path}; SHA256 ${sources[i].sha256}`})),executedAt:new Date().toISOString()});
const snapshot={surface:'dashboard',title:'صف خطا و پذیرش محصول',generatedAt:new Date().toISOString(),status:'نمونه محلی از شواهد مستند؛ سنجه مشتری واقعی ندارد',filters:[],queries:{
 incident_queue:{rows:incidents,source:source('صف شواهد خطا؛ نه شمار خطای زنده',['native','demo','auth','market','review','recheck','ci','baseline'],[{label:'ردیف خطا',definition:'یک گزارش یا یافته مستند با نوع شاهد و وضعیت محدود به منبع؛ وضعیت تاریخی جای وضعیت جاری نیست.',componentIds:['incident-queue']},{label:'اولویت',definition:'پیشنهاد triage P11 یا گیت ثبت‌شده؛ SLA یا شدت مصوب مشتری نیست.',componentIds:['incident-queue']}])},
 package_acceptance:{rows:capabilities,source:source('پذیرش قابلیت‌ها بر پایه برنامه و شواهد موجود',['native','demo','baseline','contracts','review','support'],[{label:'پذیرش',definition:'قابلیت موردنیاز سند03 و گیت باقی؛ شمار آزمون/PR یا CI اثبات پذیرش عضو نیست. پذیرش انسانی OPEN است.',componentIds:['package-acceptance']}])},
 support_tracking:{rows:supportRows,source:source('پیگیری مشتق از receipt مصنوعی اجرایی',['support'],[{label:'received',definition:'دریافت پس از consent و receipt fixture معتبر؛ پاسخ انسانی یا SLA را ثابت نمی‌کند.',componentIds:['support-tracking']}])},
},sourceManifest:sources};
writeFileSync(new URL('./dashboard-snapshot.json',import.meta.url),JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({incidents:incidents.length,packages:capabilities.length,supportExamples:supportRows.length,realMemberMetrics:0}));
