import { Navigation } from "./components/Navigation";
import { HeroSignalField } from "./components/HeroSignalField";
import { ResearchVisual } from "./components/ResearchVisual";

const experiences = [
  {
    company: "字节跳动",
    period: "2025.02–NOW",
    dateTime: "2025-02",
    current: true,
  },
  {
    company: "阿里巴巴国际数字商业集团",
    period: "2023.07–2025.01",
    dateTime: "2023-07/2025-01",
    current: false,
  },
  {
    company: "阿里巴巴达摩院",
    period: "2022.06–2023.06",
    dateTime: "2022-06/2023-06",
    current: false,
  },
];

const papers = [
  {
    id: "01",
    title: [
      "ResFi: WiFi-Enabled Device-Free",
      "Respiration Detection Based on Deep Learning",
    ],
    venue: "IEEE 17th International Conference on Control and Automation",
    meta: "2022  ·  DOI 10.1109/ICCA54724.2022.9831898",
    href: "https://ieeexplore.ieee.org/document/9831898",
    visual: "wave" as const,
  },
  {
    id: "02",
    title: ["Road-Network-Based", "Fast Geolocalization"],
    venue: "IEEE Transactions on Geoscience and Remote Sensing",
    meta: "2021  ·  DOI 10.1109/TGRS.2020.3011034",
    href: "https://ieeexplore.ieee.org/document/9170807",
    visual: "road" as const,
  },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Navigation />
      <main id="content">
        <section className="section hero grid-surface" id="hero" aria-labelledby="hero-title" tabIndex={-1}>
          <div className="hero-frame" aria-hidden="true" />
          <h1 className="hero-name" id="hero-title">
            JAXON
          </h1>
          <div className="hero-copy">
            <p className="hero-statement">
              <span>COMPILING INTELLIGENCE</span>
              <span>FOR THE REAL WORLD_</span>
            </p>
            <a className="terminal-button hero-cta" href="#experience">
              <span>ENTER ARCHIVE</span>
              <span className="button-arrow" aria-hidden="true">›</span>
            </a>
          </div>
          <div className="hero-media" aria-hidden="true">
            {/* The static export serves this local WebP directly; its Next image optimizer is not used. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/hero-processor-field.webp" alt="" width="1448" height="1086" />
            <HeroSignalField />
          </div>
        </section>

        <section
          className="section experience grid-surface"
          id="experience"
          aria-labelledby="experience-title"
          tabIndex={-1}
        >
          <div className="section-kicker reveal" id="experience-title">
            <span>EXPERIENCE.LOG</span>
            <span className="kicker-rule" aria-hidden="true" />
            <span className="square-end" aria-hidden="true" />
          </div>
          <div className="experience-log reveal">
            {experiences.map((item) => (
              <article className={`experience-row${item.current ? " is-current" : ""}`} key={item.company}>
                <div className="timeline-cell" aria-hidden="true">
                  <span className="timeline-node" />
                  <span className="node-lead" />
                </div>
                <div className="experience-copy">
                  <h2>{item.company}</h2>
                  <p>AI 算法工程师 / AI Algorithm Engineer</p>
                </div>
                <time className="experience-date" dateTime={item.dateTime}>
                  {item.period}
                </time>
                {item.current ? <span className="process-state">PROCESS ACTIVE</span> : null}
              </article>
            ))}
          </div>
        </section>

        <section
          className="section research grid-surface"
          id="research"
          aria-label="Research publications"
          tabIndex={-1}
        >
          <div className="research-frame reveal">
            {papers.map((paper) => (
              <article className={`research-packet is-${paper.visual}`} key={paper.id}>
                <div className="paper-copy">
                  <p className="paper-index">PUBLICATION {paper.id}</p>
                  <h2>
                    {paper.title.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </h2>
                  <p className="paper-venue">{paper.venue}</p>
                  <p className="paper-meta">{paper.meta}</p>
                  <a className="terminal-button paper-link" href={paper.href} target="_blank" rel="noreferrer">
                    <span>VIEW PAPER ↗</span>
                    <span className="button-arrow" aria-hidden="true">›</span>
                  </a>
                </div>
                <div className={`paper-visual is-${paper.visual}`}>
                  <ResearchVisual variant={paper.visual} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          className="section foundations grid-surface"
          id="foundations"
          aria-labelledby="foundations-title"
          tabIndex={-1}
        >
          <h2 className="section-kicker foundations-kicker reveal" id="foundations-title">
            <span>FOUNDATIONS.INDEX</span>
            <span className="kicker-rule" aria-hidden="true" />
            <span className="square-end" aria-hidden="true" />
          </h2>
          <div className="foundations-grid reveal">
            <div className="education-column">
              <div className="column-label">
                <span>EDUCATION.CHRONOLOGY</span>
                <span className="label-rule" aria-hidden="true" />
                <span className="square-end" aria-hidden="true" />
              </div>
              <div className="education-timeline">
                <article className="education-item">
                  <span className="education-node" aria-hidden="true" />
                  <h3>南洋理工大学</h3>
                  <p>计算机控制及其自动化，硕士</p>
                  <time dateTime="2020-12/2022-03">2020.12–2022.03</time>
                </article>
                <article className="education-item">
                  <span className="education-node" aria-hidden="true" />
                  <h3>东南大学</h3>
                  <p>电气工程及其自动化，学士</p>
                  <time dateTime="2016-09/2020-06">2016.09–2020.06</time>
                </article>
              </div>
            </div>
            <div className="toolchain-column">
              <div className="column-label">
                <span>TOOLCHAIN.INDEX</span>
                <span className="label-rule" aria-hidden="true" />
                <span className="square-end" aria-hidden="true" />
              </div>
              <dl className="toolchain-list" aria-label="Technical toolchain">
                <div className="toolchain-module" data-index="01">
                  <dt>LANGUAGES</dt>
                  <dd><span>PYTHON</span><span>C++</span><span>SQL</span></dd>
                </div>
                <div className="toolchain-module" data-index="02">
                  <dt>FRAMEWORK</dt>
                  <dd><span>PYTORCH</span></dd>
                </div>
                <div className="toolchain-module" data-index="03">
                  <dt>SYSTEMS</dt>
                  <dd><span>LINUX</span><span>DOCKER</span><span>MYSQL</span></dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="foundation-footer reveal" aria-hidden="true">
            <span className="matrix-dots" />
            <span className="foundation-index"><b>04</b> / FOUNDATION LAYER</span>
            <span className="foundation-rule" />
          </div>
        </section>

        <section
          className="section contact grid-surface"
          id="contact"
          aria-labelledby="contact-title"
          tabIndex={-1}
        >
          <div className="channel-label reveal" id="contact-title">
            <span aria-hidden="true">⌜</span>
            OPEN_CHANNEL
          </div>
          <div className="contact-trace trace-in" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <a className="email-link" href="mailto:hujiaxingseu@163.com">
            <span>hujiaxingseu</span><span>@163.com</span><i aria-hidden="true" />
          </a>
          <div className="contact-trace trace-out" aria-hidden="true">
            <i /><i /><i /><i /><span>➤</span>
          </div>
          <a className="terminal-button contact-cta reveal" href="mailto:hujiaxingseu@163.com">
            <span>SEND SIGNAL</span>
            <span className="button-arrow" aria-hidden="true">›</span>
          </a>
          <footer className="site-footer reveal">
            <span aria-hidden="true" />
            JAXON / 2026
          </footer>
        </section>
      </main>
    </>
  );
}
