-- =============================================
-- CRICKEN NÓMINA - Supabase Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Workers / Empleados
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  webauthn_credential_id TEXT,
  webauthn_public_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedule by day of week (admin configures this)
CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday...
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day_of_week)
);

-- Hourly rate ranges per worker
CREATE TABLE IF NOT EXISTS public.hourly_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  rate_per_hour NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time logs - clock in/out records
CREATE TABLE IF NOT EXISTS public.time_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  clock_in_lat DOUBLE PRECISION,
  clock_in_lng DOUBLE PRECISION,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  clock_in_notes TEXT,
  clock_out_notes TEXT,
  is_overtime BOOLEAN DEFAULT false,
  overtime_reason TEXT, -- 'forgot' | 'authorized_task'
  original_clock_out TIMESTAMPTZ, -- if worker corrected clock out time
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed', 'admin_modified')),
  hours_worked NUMERIC(6,2),
  amount_earned NUMERIC(10,2),
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  payment_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment records
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  notes TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Calculate hours and earnings for a time_log
CREATE OR REPLACE FUNCTION calculate_time_log_earnings(log_id UUID)
RETURNS void AS $$
DECLARE
  log_record RECORD;
  worker_rates RECORD;
  total_hours NUMERIC := 0;
  total_amount NUMERIC := 0;
  current_time_iter TIMESTAMPTZ;
  end_time_iter TIMESTAMPTZ;
  rate NUMERIC;
  segment_hours NUMERIC;
BEGIN
  SELECT * INTO log_record FROM public.time_logs WHERE id = log_id;
  
  IF log_record.clock_out IS NULL THEN
    RETURN;
  END IF;

  -- Simple calculation: iterate through each hour and find applicable rate
  current_time_iter := log_record.clock_in;
  end_time_iter := log_record.clock_out;
  
  -- Get total hours
  total_hours := EXTRACT(EPOCH FROM (end_time_iter - current_time_iter)) / 3600;
  
  -- Calculate earnings based on rate ranges
  -- For each rate range that overlaps with the work period
  FOR worker_rates IN 
    SELECT * FROM public.hourly_rates 
    WHERE worker_id = log_record.worker_id
    ORDER BY start_time
  LOOP
    -- Find overlap between work period and rate period (using time of day)
    DECLARE
      rate_start TIMESTAMPTZ := DATE_TRUNC('day', log_record.clock_in) + worker_rates.start_time;
      rate_end TIMESTAMPTZ := DATE_TRUNC('day', log_record.clock_in) + worker_rates.end_time;
      overlap_start TIMESTAMPTZ;
      overlap_end TIMESTAMPTZ;
    BEGIN
      overlap_start := GREATEST(current_time_iter, rate_start);
      overlap_end := LEAST(end_time_iter, rate_end);
      
      IF overlap_end > overlap_start THEN
        segment_hours := EXTRACT(EPOCH FROM (overlap_end - overlap_start)) / 3600;
        total_amount := total_amount + (segment_hours * worker_rates.rate_per_hour);
      END IF;
    END;
  END LOOP;

  -- If no rates defined, use 0
  UPDATE public.time_logs 
  SET 
    hours_worked = ROUND(total_hours::NUMERIC, 2),
    amount_earned = ROUND(total_amount, 2),
    updated_at = NOW()
  WHERE id = log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_logs_updated_at
  BEFORE UPDATE ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Workers can read their own record
CREATE POLICY "workers_read_own" ON public.workers
  FOR SELECT USING (auth.uid() = auth_user_id);

-- Workers can update their own record (for webauthn)
CREATE POLICY "workers_update_own" ON public.workers
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- Workers can insert their own record on registration
CREATE POLICY "workers_insert_own" ON public.workers
  FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- Anyone authenticated can read schedules
CREATE POLICY "schedules_read_authenticated" ON public.schedules
  FOR SELECT USING (auth.role() = 'authenticated');

-- Workers can read their own hourly rates
CREATE POLICY "rates_read_own" ON public.hourly_rates
  FOR SELECT USING (
    worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = auth.uid())
  );

-- Workers can read their own time logs
CREATE POLICY "timelogs_read_own" ON public.time_logs
  FOR SELECT USING (
    worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = auth.uid())
  );

-- Workers can insert their own time logs
CREATE POLICY "timelogs_insert_own" ON public.time_logs
  FOR INSERT WITH CHECK (
    worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = auth.uid())
  );

-- Workers can update their own open time logs (clock out)
CREATE POLICY "timelogs_update_own" ON public.time_logs
  FOR UPDATE USING (
    worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = auth.uid())
    AND status = 'open'
  );

-- Workers can read their own payments
CREATE POLICY "payments_read_own" ON public.payments
  FOR SELECT USING (
    worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = auth.uid())
  );

-- =============================================
-- ADMIN POLICIES (using service role from API)
-- The admin uses the service role key which bypasses RLS
-- =============================================

-- =============================================
-- SEED DEFAULT SCHEDULES
-- =============================================

INSERT INTO public.schedules (day_of_week, start_time, end_time) VALUES
  (1, '10:00', '22:00'), -- Monday
  (2, '10:00', '22:00'), -- Tuesday
  (3, '10:00', '22:00'), -- Wednesday
  (4, '10:00', '22:00'), -- Thursday
  (5, '10:00', '22:00'), -- Friday
  (6, '10:00', '22:00'), -- Saturday
  (0, '12:00', '20:00')  -- Sunday
ON CONFLICT (day_of_week) DO NOTHING;
