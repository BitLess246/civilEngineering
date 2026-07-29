import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthCard, PasswordField, SubmitButton, FormAlert, NotConfigured } from '../../components/AuthForms'
import { updatePassword, isAuthConfigured } from '../../lib/auth/authClient'
import { passwordError, confirmError } from '../../lib/auth/validation'

/** Landing page for the emailed reset link. Supabase puts a recovery session in
 *  the URL, which the client picks up via `detectSessionInUrl`, so by the time
 *  this renders the user is authenticated just long enough to set a password. */
export default function ResetPassword() {
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errs, setErrs] = useState<{ password?: string; confirm?: string }>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const configured = isAuthConfigured()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setAlert(null)
    const p = passwordError(password), c = confirmError(password, confirm)
    setErrs({ ...(p ? { password: p } : {}), ...(c ? { confirm: c } : {}) })
    if (p || c) return
    setBusy(true)
    const r = await updatePassword(password)
    setBusy(false)
    if (!r.ok) {
      setAlert(r.error.kind === 'not-configured' ? r.error.message
        : 'That reset link may have expired. Request a new one and try again.')
      return
    }
    nav('/signin', { replace: true })
  }

  return (
    <AuthCard title="Choose a new password"
      footer={<Link to="/forgot-password" className="font-medium text-[#0056b3] underline">Request a new link</Link>}>
      {!configured ? <NotConfigured /> : (
        <form onSubmit={submit} noValidate>
          {alert && <FormAlert tone="error">{alert}</FormAlert>}
          <PasswordField label="New password" value={password} onChange={setPassword}
            error={errs.password} autoComplete="new-password" disabled={busy} meter />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm}
            error={errs.confirm} autoComplete="new-password" disabled={busy} />
          <SubmitButton busy={busy}>Update password</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
