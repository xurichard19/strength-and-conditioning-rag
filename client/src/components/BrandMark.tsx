import arcelLogo from '../assets/arcel-logo.png'

export function BrandMark() {
  return (
    <span className="block h-8 w-8 shrink-0 overflow-hidden rounded-md bg-[#101014]">
      <img
        src={arcelLogo}
        alt=""
        className="h-14 w-14 max-w-none -translate-x-3 -translate-y-3 object-cover"
      />
    </span>
  )
}
