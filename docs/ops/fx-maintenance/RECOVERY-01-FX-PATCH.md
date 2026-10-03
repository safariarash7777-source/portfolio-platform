# RECOVERY-01 FX — آماده نصب محدود توسط manifest P00

candidate status-only موجود سرور: fx-dashboard:recovery01-status-20261003؛ ID486452d0…؛ پایه ID833e161e… . فقط agent_status_ui.py و maintenance_status.py داخلimage عوض می‌شوند. app.py/models.py/data_sources.py/auth_gate/منبع و عدد مالی، imageفرانت اصلی و timerساعتی دست نمی‌خورند. checksumهای دقیق در RELEASE-MANIFEST ثبت است.

آزمون component در Docker networknone/read-only با mountواقعی داده فقطخواندنی PASS: سه محور قابل مشاهده، صفرexception/provider/model. پنج آزمون اتصالproxy PASS. tick واقعی همانjobمحلی PASS، موعدنرسیده و هیچrunاقتصادیextra آغازنشد.

## عملیات آماده

- ابزارSSH: liara_connection.py به‌همراهvm_command.py موجود؛ autoprobe500ms درloopback، proxyموجوداگرروشنباشد، و TLSمعتبرdirectوقتیخاموشاست؛ RejectPolicy/known-hosts واعتبارموجود حفظ. نصب محلی ایندو فایل باbackupcode وchecksum انجام می‌شود.
- زمان‌بند: operations/install-windows-hermes-ticker.ps1 یکWindowsTask باprincipalفعلیInteractive/Limited، StartWhenAvailable وIgnoreNew ایجاد می‌کند؛ cron tick هر15دقیقه وهنگامlogon. خودjob9f78482170f4 همان5روز/luna/provider/local باقی است. فقطهمینjobفعال/local مجازاست؛ اضافه‌شدنjobدیگر tickerراfailclosedمی‌کند. خاموشی/خروجازحساب اجرا را متوقف می‌کند؛ هزینهسرویس تازه ندارد. rollback: Uninstall همانscript وبدونتغییرjob.
- configbackup سرور0600 وmetadatabefore باreadback/hash آماده شد؛ فایل خصوصی چاپ/منتشر نشده. originalcontainer/image/data mount محفوظ است.
- release script /tmp/recovery_fx_status_release.py؛ prepareانجام‌شده؛ نصب فقطباreceipt P00 کهmission/base_image_id/candidate_image_id/approved_by=P00 دارد. scriptContainerConfig/Env/HostConfig/network/data mount را نگه می‌دارد؛ oldcontainerنامbackupمی‌گیرد؛ شکستstart/health/preservation خودکارrollbackمی‌کند. oldcontainer/image حذف نمی‌شود. scopeOnlyStatus وکل212 نصب نمی‌شود.
- پسازreceipt، انتشارmetadataمحلی همانrun30سپتامبر باupdated_at/finished_atمحفوظ وscheduleواقعی وreceiptخواندنbytes؛ آنرااجرایاقتصادی3اکتبر نمی‌نامیم. source data/fileاکسل تغییرنمی‌کند.

rollback اجرایی: python3 /tmp/recovery_fx_status_release.py rollback --manifest /tmp/recovery-fx-status-manifest-20261003.json ؛ دادهfinancialدست‌نخورده وگزارش جدیدmetadataباUIقدیمcompatibleمی‌ماند. backupmetadataدر /opt/fx-dashboard/releases/recovery01-status-20261003/metadata-before محفوظاست.

انتشار سرویس هنوز انجام نشده؛ منتظر receipt نسخه واحد P00. پذیرش admin/fx رویVercel باP01 بعدورود واقعی است؛ componentPASS وstandalonehealthy جایگزین آن نیست.
