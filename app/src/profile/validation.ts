import { z } from 'zod';

// Mirrors the checks on public.profiles so people see friendly errors; the database stays the real guard.

const optionalText = (max: number, message: string) =>
  z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().max(max, { message }))
    .transform((s) => s || null);

// Accepts what people paste: "linkedin.com/in/ana", "www.linkedin.com/in/ana/", full https URLs.
const linkedinUrl = z
  .string()
  .trim()
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s.replace(/^http:/i, 'https:')))
  .pipe(
    z.union([
      z.literal(''),
      z.string().regex(/^https:\/\/([a-z]+\.)?linkedin\.com\/\S+$/i, {
        message: 'Use your LinkedIn profile link, like linkedin.com/in/your-name',
      }),
    ]),
  )
  .transform((s) => s || null);

const gradYear = z
  .string()
  .trim()
  .pipe(
    z.union([
      z.literal(''),
      z.string().regex(/^\d{4}$/, { message: 'Enter a 4-digit year' }),
    ]),
  )
  .transform((s) => (s ? Number(s) : null))
  .pipe(
    z
      .number()
      .min(1950, { message: 'Enter a year between 1950 and 2040' })
      .max(2040, { message: 'Enter a year between 1950 and 2040' })
      .nullable(),
  );

const profileFormSchema = z.object({
  full_name: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1, { message: 'Enter your name' })
        .max(120, { message: 'Keep your name under 120 characters' }),
    ),
  headline: optionalText(200, 'Keep your headline under 200 characters'),
  linkedin_url: linkedinUrl,
  grad_year: gradYear,
});

export type ProfileForm = z.input<typeof profileFormSchema>;
type ProfileInput = z.output<typeof profileFormSchema>;

export type FieldErrors = Partial<Record<keyof ProfileForm, string>>;

export function parseProfileForm(
  form: ProfileForm,
): { ok: true; value: ProfileInput } | { ok: false; errors: FieldErrors } {
  const result = profileFormSchema.safeParse(form);
  if (result.success) return { ok: true, value: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ProfileForm;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
