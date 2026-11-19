import type { Metadata } from 'next';
import { PageShell } from '@/components/shell/PageShell';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <PageShell title="About Examdle">
      <div className="prose-game space-y-4">
        <p>
          Examdle turns standardized-exam prep into a few minutes of daily play. Each exam (MCAT, LSAT, USMLE Step 1 &amp; 2 CK, and the bar exam) has four
          short games with a new puzzle every day. Everyone gets the same puzzle, so you can compare spoiler-free results with friends.
        </p>
        <p>
          Content is original: drafted with the help of AI from open, permissively licensed sources, checked by automated validators, and approved by human
          reviewers with subject expertise. Spot a problem? Use “Report a problem” on any result screen.
        </p>
        <h2 className="text-xl font-bold">Disclaimers</h2>
        <p className="text-[15px]">
          Educational use only. <b>Not medical advice. Not legal advice.</b> Examdle is not affiliated with or endorsed by the AAMC, LSAC, FSMB, NBME or NCBE.
          MCAT® is a registered trademark of the AAMC. LSAT® is a registered trademark of LSAC. USMLE® is a registered trademark of FSMB and NBME. MBE®, UBE® and
          NextGen are marks of NCBE. Exam names are used only to describe what the content prepares for.
        </p>
        <h2 className="text-xl font-bold">Terms of use</h2>
        <ul className="list-disc space-y-1 pl-5 text-[15px]">
          <li>Play is on the honor system. There are no prizes or leaderboards.</li>
          <li>Content is provided as-is and may contain errors; please report them.</li>
          <li>Automated scraping of puzzles or answers is not permitted.</li>
        </ul>
      </div>
    </PageShell>
  );
}
