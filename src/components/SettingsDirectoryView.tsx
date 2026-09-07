interface SettingsDirectoryViewProps {
  audience?: 'Internal users' | 'External users';
  section: 'Roles' | 'Users' | 'Organizations' | 'Counterparties' | 'General ledger' | 'VAT classifications';
}

export default function SettingsDirectoryView({ audience, section }: SettingsDirectoryViewProps) {
  return (
    <main className="min-w-0 flex-1 overflow-auto bg-white px-8 py-7">
      <h1 className="font-montserrat text-[32px] font-semibold leading-10 text-[#10233A]">
        {section}
      </h1>
      <div className="mt-2 flex items-center gap-2 font-montserrat text-[13px] font-medium text-[#7288A3]">
        <span>Settings</span>
        <span>/</span>
        {audience && <span>{audience}</span>}
        {audience && <span>/</span>}
        <span>{section}</span>
      </div>

      <section className="mt-7 min-h-[360px] rounded-xl border border-[#D9E8F0] bg-white">
        <div className="border-b border-[#D9E8F0] px-6 py-5">
          <h2 className="font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">
            {audience ? `${audience} — ${section.toLowerCase()}` : section}
          </h2>
        </div>
        <div className="flex min-h-[285px] items-center justify-center px-6 text-center">
          <p className="max-w-md font-montserrat text-[14px] font-medium leading-6 text-[#7288A3]">
            {audience
              ? `Manage ${section.toLowerCase()} for ${audience.toLowerCase()} here.`
              : `Manage ${section.toLowerCase()} here.`}
          </p>
        </div>
      </section>
    </main>
  );
}
