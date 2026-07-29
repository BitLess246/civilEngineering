import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthCard, TextField, PasswordField, SubmitButton, FormAlert, NotConfigured } from '../../components/AuthForms'
import { signUp, isAuthConfigured } from '../../lib/auth/authClient'
import { signUpErrors } from '../../lib/auth/validation'

export default function SignUp() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errs, setErrs] = useState<{ email?: string; password?: string; confirm?: string }>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const configured = isAuthConfigured()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setAlert(null)
    const v = signUpErrors({ email, password, confirm })
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    const r = await signUp(email.trim(), password, name.trim() || undefined)
    setBusy(false)
    if (!r.ok) { setAlert(r.error.message); return }
    if (r.value.needsVerification) { setSent(true); return }
    nav('/', { replace: true })
  }

  if (sent) {
    return (
      <AuthCard title="Check your email"
        footer={<Link to="/signin" className="font-medium text-[#0056b3] underline">Back to sign in</Link>}>
        <FormAlert tone="success">
          <p className="font-semibold">Almost there.</p>
          <p className="mt-1">
            We sent a confirmation link to <strong>{email.trim()}</strong>. Open it to finish creating your
            account. The link expires after a while — request another from the sign-in page if it does.
          </p>
        </FormAlert>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle="Free. Unlocks the 3D model space, the design pipeline, reports and saved projects."
      footer={<>Already registered? <Link to="/signin" className="font-medium text-[#0056b3] underline">Sign in</Link></>}
    >
      {!configured ? <NotConfigured /> : (
        <form onSubmit={submit} noValidate>
          {alert && <FormAlert tone="error">{alert}</FormAlert>}
          <TextField label="Name" value={name} onChange={setName}
            autoComplete="name" placeholder="Optional" disabled={busy} />
          <TextField label="Email" type="email" value={email} onChange={setEmail}
            error={errs.email} autoComplete="email" disabled={busy} />
          <PasswordField label="Password" value={password} onChange={setPassword}
            error={errs.password} autoComplete="new-password" disabled={busy} meter />
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm}
            error={errs.confirm} autoComplete="new-password" disabled={busy} />
          <SubmitButton busy={busy}>Create account</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
