-- Phase 8b: Leads table for CRM / webhook from miniapp
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'miniapp',
  name TEXT NOT NULL,
  phone TEXT,
  topic TEXT,
  message TEXT,
  preferred_date TEXT,
  preferred_time TEXT,
  telegram_username TEXT,
  telegram_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new, contacted, converted, archived
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Only service_role and admin can read leads
CREATE POLICY "Admin can manage leads" ON public.leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow service_role (used by webhook) full access
CREATE POLICY "Service role full access on leads" ON public.leads
  FOR ALL USING (auth.role() = 'service_role');

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);
