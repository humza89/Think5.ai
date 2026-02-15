"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { slug: "overview",  label: "Overview" },
  { slug: "linkedin",  label: "LinkedIn" },
  { slug: "resume",    label: "Resume" },
  { slug: "notes",     label: "Private notes" },
];

export default function TabsNav({ id }: { id: string }) {
  const path = usePathname();
  return (
    <div className="border-b bg-white">
      <div className="px-6 flex gap-6 overflow-x-auto">
        {tabs.map(t => {
          const href = `/candidates/${id}/${t.slug}`;
          const active = path?.startsWith(href);
          return (
            <Link key={t.slug} href={href}
              className={`py-3 text-sm whitespace-nowrap ${active ? "border-b-2 border-blue-600 font-medium text-blue-600" : "text-gray-600 hover:text-black"}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
