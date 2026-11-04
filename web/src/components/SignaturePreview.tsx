/** The company signature as it will appear under a letter (shown in letter previews). */
export function SignaturePreview({ signature }: { signature: { text: string; logoUrl: string | null } | null | undefined }) {
  if (!signature) return null;
  return (
    <div className="mt-3 border-t border-slate-300 pt-3 text-[13px] text-slate-600">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {signature.logoUrl && <img src={signature.logoUrl} alt="" className="mb-2 max-h-[60px] max-w-[200px]" />}
      <div className="whitespace-pre-wrap">{signature.text}</div>
    </div>
  );
}
