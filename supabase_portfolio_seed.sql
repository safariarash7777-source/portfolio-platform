-- ════════════════════════════════════════════════════════════════
-- Demo seed for the founder's live portfolio (holdings + transactions + snapshots).
-- Idempotent: clears this user's rows first. Run AFTER supabase_portfolio_tracking.sql.
-- Founder is resolved by email; change it if seeding another account.
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'safariarash7777@gmail.com';
  IF uid IS NULL THEN
    RAISE NOTICE 'No auth user for that email yet — sign up first, then re-run.';
    RETURN;
  END IF;

  DELETE FROM public.holdings            WHERE user_id = uid;
  DELETE FROM public.transactions        WHERE user_id = uid;
  DELETE FROM public.portfolio_snapshots WHERE user_id = uid;

  INSERT INTO public.holdings (user_id, symbol, name, asset_class, qty, avg_price, current_price, day_change_pct) VALUES
    (uid, 'فولاد', 'فولاد مبارکه اصفهان',        'سهام',              120000,  5200,  5840,  1.6),
    (uid, 'شستا',  'سرمایه‌گذاری تأمین اجتماعی',   'سهام',              350000,  1500,  1420, -0.9),
    (uid, 'وبملت', 'بانک ملت',                    'سهام',              180000,  2800,  3120,  2.3),
    (uid, 'کگل',   'معدنی و صنعتی گل‌گهر',         'سهام',               45000,  3600,  3760,  0.4),
    (uid, 'اعتماد','صندوق با درآمد ثابت اعتماد',    'صندوق درآمد ثابت',    9000, 78000, 80300,  0.1),
    (uid, 'طلا',   'صندوق طلای لوتوس',             'طلا',                26000, 18500, 20392, -1.2);

  INSERT INTO public.transactions (user_id, type, instrument, amount, occurred_at) VALUES
    (uid, 'خرید',   'فولاد', 116800000, now() - interval '4 days'),
    (uid, 'واریز',   NULL,    200000000, now() - interval '6 days'),
    (uid, 'فروش',   'کگل',    84600000, now() - interval '10 days'),
    (uid, 'خرید',   'اعتماد', 160600000, now() - interval '17 days'),
    (uid, 'برداشت',  NULL,     50000000, now() - interval '24 days');

  INSERT INTO public.portfolio_snapshots (user_id, as_of, value) VALUES
    (uid, current_date - 330, 3785000000),
    (uid, current_date - 300, 3690000000),
    (uid, current_date - 270, 3920000000),
    (uid, current_date - 240, 4050000000),
    (uid, current_date - 210, 3980000000),
    (uid, current_date - 180, 4210000000),
    (uid, current_date - 150, 4360000000),
    (uid, current_date - 120, 4280000000),
    (uid, current_date -  90, 4510000000),
    (uid, current_date -  60, 4640000000),
    (uid, current_date -  30, 4590000000),
    (uid, current_date -   1, 4820000000);
END $$;
