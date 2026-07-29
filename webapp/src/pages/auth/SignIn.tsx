import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { AuthCard, TextField, PasswordField, SubmitButton, FormAlert, NotConfigured } from '../../components/AuthForms'
import { signIn, isAuthConfigured } from '../../lib/auth/authClient'
import { signInErrors } from '../../lib/auth/validation'

export default function SignIn() {
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errs, setErrs] = useState<{ email?: string; password?: string }>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const configured = isAuthConfigured()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setAlert(null)
    const v = signInErrors({ email, password })
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    const r = await signIn(email.trim(), password)
    setBusy(false)
    if (!r.ok) { setAlert(r.error.message); return }
    nav(from, { replace: true })
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Sign in to reach the 3D model space, the design pipeline and saved projects."
      footer={<>No account? <Link to="/signup" className="font-medium text-[#0056b3] underline">Create one</Link></>}
    >
      {!configured ? <NotConfigured /> : (
        <form onSubmit={submit} noValidate>
          {alert && <FormAlert tone="error">{alert}</FormAlert>}
          <TextField label="Email" type="email" value={email} onChange={setEmail}
            error={errs.email} autoComplete="email" disabled={busy} />
          <PasswordField label="Password" value={password} onChange={setPassword}
            error={errs.password} autoComplete="current-password" disabled={busy} />
          <div className="mb-4 text-right">
            <Link to="/forgot-password" className="text-[12px] text-slate-500 underline hover:text-[#0056b3]">
              Forgot your password?
            </Link>
          </div>
          <SubmitButton busy={busy}>Sign in</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
