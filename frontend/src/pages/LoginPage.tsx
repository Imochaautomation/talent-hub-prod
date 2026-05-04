import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { useLogin } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

const FEATURES = ['Pay Equity', 'AI Insights', 'RSU Tracking', 'Scenario Modeling', 'Variable Pay'];

export default function LoginPage() {
  const { isAuthenticated } = useAuthStore();
  const loginMutation = useLogin();

  // useForm must be called unconditionally — hooks cannot appear after an early return
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <style>{`
        @keyframes _fA {
          0%,100% { transform:translate(0,0) scale(1); }
          33%      { transform:translate(40px,-55px) scale(1.08); }
          66%      { transform:translate(-30px,30px) scale(0.93); }
        }
        @keyframes _fB {
          0%,100% { transform:translate(0,0) scale(1); }
          40%      { transform:translate(-50px,40px) scale(1.1); }
          80%      { transform:translate(30px,-30px) scale(0.9); }
        }
        @keyframes _fC {
          0%,100% { transform:translate(0,0) scale(1); }
          50%      { transform:translate(25px,50px) scale(1.12); }
        }
        @keyframes _fu {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .l-oa { animation:_fA 14s ease-in-out infinite; }
        .l-ob { animation:_fB 18s ease-in-out infinite; }
        .l-oc { animation:_fC 12s ease-in-out infinite; }
        .l-f0 { animation:_fu 0.55s ease-out 0.05s both; }
        .l-f1 { animation:_fu 0.55s ease-out 0.18s both; }
        .l-f2 { animation:_fu 0.55s ease-out 0.30s both; }
        .l-f3 { animation:_fu 0.55s ease-out 0.42s both; }
        .ul-field {
          width:100%; background:transparent; color:#fff;
          font-size:0.9rem; padding-bottom:10px;
          border:none; border-bottom:1.5px solid rgba(255,255,255,0.18);
          transition:border-color 0.2s;
        }
        .ul-field::placeholder { color:rgba(255,255,255,0.22); }
        .ul-field:focus { outline:none; border-bottom-color:#826FFF; }
        .ul-field-err { border-bottom-color:#f87171 !important; }
      `}</style>

      <div className="min-h-screen flex">

        {/* ══ RIGHT: Clean minimal form ══ */}
        <div
          className="relative flex flex-col justify-center w-full lg:w-[42%] px-12 lg:px-16 xl:px-20 py-10 order-2"
          style={{ background: '#13111D' }}
        >
          {/* Heading */}
          <div className="l-f1 mb-10">
            <h2 className="text-[2.2rem] font-black text-white leading-tight mb-2">
              Welcome back
            </h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Sign in to your compensation platform
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit((data) => loginMutation.mutate(data))}
            className="l-f2 space-y-9"
          >
            {/* Email */}
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-3"
                style={{ color: 'rgba(255,255,255,0.32)' }}
              >
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                {...register('email')}
                className={cn('ul-field', errors.email && 'ul-field-err')}
                placeholder="vijuadmin@imocha.io"
              />
              {errors.email && (
                <p className="text-[11px] text-red-400 mt-1.5">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-3"
                style={{ color: 'rgba(255,255,255,0.32)' }}
              >
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className={cn('ul-field', errors.password && 'ul-field-err')}
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="text-[11px] text-red-400 mt-1.5">{errors.password.message}</p>
              )}
            </div>

            {/* CTA */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg,#826FFF 0%,#6048E5 100%)',
                  boxShadow: '0 8px 28px rgba(130,111,255,0.38)',
                }}
              >
                {loginMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Sign in <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </form>

          {/* Mobile: show visual elements inline */}
          <div className="flex lg:hidden flex-wrap justify-center gap-2 mt-10">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(130,111,255,0.15)',
                  border: '1px solid rgba(130,111,255,0.3)',
                  color: '#C5FFDC',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* ══ LEFT: Gradient visual panel (desktop only) ══ */}
        <div
          className="hidden lg:flex flex-1 flex-col items-center justify-center relative overflow-hidden order-1"
          style={{ background: 'linear-gradient(145deg,#826FFF 0%,#5B47D4 45%,#3A2BA8 100%)' }}
        >
          {/* Animated orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="l-oa absolute -top-[20%] right-[-8%] w-[500px] h-[500px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(197,255,220,0.32) 0%,transparent 65%)', filter: 'blur(32px)' }}
            />
            <div
              className="l-ob absolute -bottom-[20%] left-[-8%] w-[450px] h-[450px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(197,255,220,0.2) 0%,transparent 65%)', filter: 'blur(38px)' }}
            />
            <div
              className="l-oc absolute top-[35%] left-[25%] w-[340px] h-[340px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.08) 0%,transparent 65%)', filter: 'blur(44px)' }}
            />
            {/* Dot grid */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.22) 1px,transparent 1px)',
                backgroundSize: '28px 28px',
                opacity: 0.45,
              }}
            />
          </div>

          {/* iMocha logo — top-left of gradient panel */}
          <div className="absolute top-8 left-10 z-10">
            <img src="/imocha-logo.svg" alt="iMocha" className="h-12 w-auto" />
          </div>

          {/* Brand content */}
          <div className="relative z-10 flex flex-col items-center text-center px-14 space-y-8">
            {/* Large C badge */}
            <div className="l-f0">
              <div
                className="w-24 h-24 rounded-3xl mx-auto flex items-center justify-center text-white font-black text-4xl"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(20px)',
                  border: '1.5px solid rgba(255,255,255,0.22)',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
                }}
              >
                C
              </div>
            </div>

            {/* Headline */}
            <div className="l-f1 space-y-3">
              <h1 className="text-[2.6rem] font-black text-white leading-[1.1]">
                Compensation<br />
                <span style={{ color: '#C5FFDC' }}>Intelligence</span><br />
                Reimagined.
              </h1>
              <p className="text-sm max-w-[18rem] mx-auto" style={{ color: 'rgba(255,255,255,0.48)' }}>
                AI-powered decisions across every band, role, and department.
              </p>
            </div>

            {/* Feature pills */}
            <div className="l-f2 flex flex-wrap justify-center gap-2 max-w-xs">
              {FEATURES.map((f) => (
                <span
                  key={f}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.82)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>

            <div className="l-f3">
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                Powered by Claude AI · Built for HR Leaders
              </p>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
