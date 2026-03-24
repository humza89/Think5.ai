export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-auto bg-zinc-950">
      {children}
    </div>
  );
}
