import * as React from 'react'
import { Input } from '@/components/ui/input'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { parseAmountInput } from '@/lib/format'

type AmountInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'inputMode'>

/**
 * Text input for a money amount, typed under the display locale's separators.
 *
 * A `type="number"` input only takes the browser's own decimal mark, so it
 * rejects "12,34" on comma-decimal formats (issue #1072). Keep the value as
 * the typed string, read it back with `parseAmountInput(value, locale)` and
 * seed it from a stored number with `formatAmountInput`. Input that doesn't
 * parse is flagged `aria-invalid` so the field shows it before saving.
 */
export function AmountInput({ value, ...props }: AmountInputProps) {
  const locale = useDisplayLocale()
  const text = value == null ? '' : String(value)
  const invalid = text.trim() !== '' && parseAmountInput(text, locale) == null
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}
