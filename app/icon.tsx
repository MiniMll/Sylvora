import { ImageResponse } from 'next/og'
import {
  SYLVORA_ICON_RECT,
  SYLVORA_MARK_PATH,
  SYLVORA_VIOLET,
  SYLVORA_VIOLET_LIGHT,
} from '@/components/brand/mark'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={SYLVORA_VIOLET_LIGHT} />
            <stop offset="1" stopColor={SYLVORA_VIOLET} />
          </linearGradient>
        </defs>
        <rect {...SYLVORA_ICON_RECT} fill="url(#g)" />
        <path d={SYLVORA_MARK_PATH} fill="white" />
      </svg>
    ),
    size,
  )
}
