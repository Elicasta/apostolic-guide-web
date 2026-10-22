import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Download, LibraryBig, ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Ekegusii Bible | Apostolic Guide",
  description: "Read and download the Ebibilia Enchenu Ekegusii Revised Bible from the copyright owner's official distribution partners.",
  robots: { index: false, follow: false },
};
export default function EkegusiiBiblePage() {
  return <div className="eg-shell">
    <header className="eg-nav"><Link href="/ekegusii" className="eg-brand"><span className="eg-brand-mark">AG</span><span><strong>APOSTOLIC GUIDE</strong><small>EKEGUSII BIBLE LIBRARY</small></span></Link>
      <Link href="/ekegusii" className="eg-back"><ArrowLeft size={16}/> Back to the 20 Pathways</Link></header>
    <main className="eg-bible-page">
      <div className="eg-eyebrow">SCRIPTURE RESOURCE / EKEGUSII</div>
      <h1>Ebibilia<br/><em>Enchenu.</em></h1>
      <p className="eg-lead">Ekegusii Revised Bible (2021), published by the Bible Society of Kenya. Read the Bible in your language alongside the Apostolic Guide teaching Pathways.</p>
      <div className="eg-bible-grid">
        <a href="https://ebible.org/study/?t1=local%3Aguz&v1=JN1_1&w1=bible" target="_blank" rel="noopener noreferrer">
          <BookOpen size={30}/><strong>Read the Ekegusii Bible</strong><span>Full online Bible reader</span><ArrowUpRight size={20}/>
        </a>
        <a href="https://ebible.org/details.php?id=guz" target="_blank" rel="noopener noreferrer">
          <Download size={30}/><strong>Download a Bible copy</strong><span>PDF, ePub, mobile, and study formats from the publisher's distributor</span><ArrowUpRight size={20}/>
        </a>
        <Link href="/ekegusii"><LibraryBig size={30}/><strong>Open Apostolic teachings</strong><span>20 connected Bible study Pathways</span><ArrowUpRight size={20}/></Link>
      </div>
      <div className="eg-bible-rights"><ShieldAlert size={21}/><p><strong>Scripture rights:</strong> © 2021 Bible Society of Kenya. All rights reserved. Apostolic Guide links to the authorized online reader and downloads; it does not reproduce or rehost the copyrighted Bible text. Contact the rights holder for an embedding or redistribution license.</p></div>
    </main>
    <footer className="eg-footer"><strong>APOSTOLIC GUIDE · EKEGUSII</strong><span>Study the Scriptures. Test the teaching.</span><Link href="/ekegusii">Return to Pathways</Link></footer>
  </div>;
}
