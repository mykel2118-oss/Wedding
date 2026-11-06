import { MARK } from "@/lib/mark";

export default function NotFound() {
  return (
    <main className="gate">
      <div className="gate-card">
        <p className="brand-footer">{MARK}</p>
        <h1>This page is not in the book.</h1>
        <a className="button" href="/">
          Return
        </a>
      </div>
    </main>
  );
}
