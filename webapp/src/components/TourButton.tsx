// The one control that starts a walkthrough. Shared so the affordance reads
// the same on every page that has one — a guide users have to hunt for is a
// guide they do not find at the moment they are stuck.

export function TourButton({ onClick, label = 'Step-by-step guide' }: {
  onClick: () => void
  label?: string
}) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-md border border-[#0056b3] px-2.5 py-1 text-[12px] font-semibold text-[#0056b3] hover:bg-[#0056b3]/5">
      {label}
    </button>
  )
}
