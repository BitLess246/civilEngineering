import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard, TextField, SubmitButton, FormAlert, NotConfigured } from '../../components/AuthForms'
import { requestPasswordReset, isAuthConfigured } from '../../lib/auth/authClient'
import { emailError } from '../../lib/auth/validation'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const [alert, setAlert] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const configured = isAuthConfigured()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setAlert(null)
    const v = emailError(email)
    setErr(v ?? undefined)
    if (v) return
    setBusy(true)
    const r = await requestPasswordReset(email.trim(), `${window.location.origin}/reset-password`)
    setBusy(false)
    if (!r.ok) { setAlert(r.error.message); return }
    setSent(true)
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={<Link to="/signin" className="font-medium text-[#0056b3] underline">Back to sign in</Link>}
    >
      {!configured ? <NotConfigured /> : sent ? (
        <FormAlert tone="success">
          {/* Deliberately does not confirm whether the address has an account —
              saying so would let anyone test which emails are registered. */}
          If <strong>{email.trim()}</strong> has an account, a reset link is on its way. Check the spam folder
          if it does not arrive in a few minutes.
        </FormAlert>
      ) : (
        <form onSubmit={submit} noValidate>
          {alert && <FormAlert tone="error">{alert}</FormAlert>}
          <TextField label="Email" type="email" value={email} onChange={setEmail}
            error={err} autoComplete="email" disabled={busy} />
          <SubmitButton busy={busy}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
