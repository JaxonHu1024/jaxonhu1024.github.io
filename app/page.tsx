import { Navigation } from "./components/Navigation";
import { HeroSignalField } from "./components/HeroSignalField";
import { ResearchVisual } from "./components/ResearchVisual";

const currentExperience = {
  company: "ByteDance",
  period: "2025.02–PRESENT",
  dateTime: "2025-02",
};

const alibabaExperiences = [
  {
    organization: "International Digital Commerce Group",
    period: "2023.07–2025.01",
    dateTime: "2023-07/2025-01",
  },
  {
    organization: "Damo Academy",
    period: "2022.06–2023.06",
    dateTime: "2022-06/2023-06",
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
              <span>VIEW EXPERIENCE</span>
              <span className="button-arrow" aria-hidden="true">›</span>
            </a>
          </div>
          <div className="hero-media" aria-hidden="true">
            {/* The static export serves this local WebP directly; its Next image optimizer is not used. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/hero-processor-field-optimized.webp" alt="" width="1448" height="1086" />
            <HeroSignalField />
          </div>
        </section>

        <section
          className="section experience grid-surface"
          id="experience"
          aria-labelledby="experience-title"
          tabIndex={-1}
        >
          <h2 className="section-kicker reveal" id="experience-title">
            <span>EXPERIENCE.LOG</span>
            <span className="kicker-rule" aria-hidden="true" />
            <span className="square-end" aria-hidden="true" />
          </h2>
          <div className="experience-log reveal">
            <article className="experience-row is-current">
              <div className="timeline-cell" aria-hidden="true">
                <span className="timeline-node" />
                <span className="node-lead" />
              </div>
              <div className="experience-copy">
                <div className="experience-entry-heading">
                  <div className="experience-entry-copy">
                    <div className="experience-title-line">
                      <h3>{currentExperience.company}</h3>
                      <span className="experience-status">CURRENT</span>
                    </div>
                    <p>AI Algorithm Engineer</p>
                  </div>
                  <time className="experience-date" dateTime={currentExperience.dateTime}>
                    {currentExperience.period}
                  </time>
                </div>
              </div>
            </article>

            <section className="experience-group" aria-labelledby="alibaba-group-title">
              <header className="experience-group-header">
                <span className="experience-group-branch" aria-hidden="true" />
                <div className="experience-group-heading">
                  <h3 id="alibaba-group-title">Alibaba</h3>
                </div>
              </header>
              <div className="experience-subentries">
                {alibabaExperiences.map((item) => (
                  <article className="experience-subentry" key={item.organization}>
                    <div className="experience-subentry-copy">
                      <h4>{item.organization}</h4>
                      <p>AI Algorithm Engineer</p>
                    </div>
                    <time className="experience-date" dateTime={item.dateTime}>
                      {item.period}
                    </time>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <p className="section-footer reveal" aria-hidden="true">
            <span className="section-footer-index"><b>01</b> {"// EXPERIENCE LAYER"}</span>
            <span className="section-footer-rule" />
          </p>
        </section>

        <section
          className="section foundations grid-surface"
          id="foundations"
          aria-labelledby="foundations-title"
          tabIndex={-1}
        >
          <h2 className="section-kicker reveal" id="foundations-title">
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
                <article className="education-item has-crest">
                  <span className="education-node" aria-hidden="true" />
                  {/* Static export serves the local SVG directly; Next image optimizer is not used. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="education-crest" src="/assets/logo-ntu.svg" alt="" aria-hidden="true" />
                  <h3>Nanyang Technological University</h3>
                  <p>Master of Science in Computer Control and Automation</p>
                  <time dateTime="2020-12/2022-03">2020.12–2022.03</time>
                </article>
                <article className="education-item has-crest">
                  <span className="education-node" aria-hidden="true" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="education-crest" src="/assets/logo-seu-color.svg" alt="" aria-hidden="true" />
                  <h3>Southeast University</h3>
                  <p>Bachelor of Engineering in Electrical Engineering and Automation</p>
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
                <div className="toolchain-module">
                  <dt>LANGUAGES</dt>
                  <dd><span>PYTHON</span><span>C++</span><span>SQL</span></dd>
                </div>
                <div className="toolchain-module">
                  <dt>FRAMEWORK</dt>
                  <dd><span>PYTORCH</span></dd>
                </div>
                <div className="toolchain-module">
                  <dt>SYSTEMS</dt>
                  <dd><span>LINUX</span><span>DOCKER</span><span>MYSQL</span></dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="section-footer reveal" aria-hidden="true">
            <span className="section-footer-index"><b>02</b> {"// FOUNDATION LAYER"}</span>
            <span className="section-footer-rule" />
          </p>
        </section>

        <section
          className="section research grid-surface"
          id="research"
          aria-labelledby="research-title"
          tabIndex={-1}
        >
          <h2 className="section-kicker reveal" id="research-title">
            <span>RESEARCH.INDEX</span>
            <span className="kicker-rule" aria-hidden="true" />
            <span className="square-end" aria-hidden="true" />
          </h2>
          <div className="research-frame reveal">
            {papers.map((paper) => (
              <article className={`research-packet is-${paper.visual}`} key={paper.id}>
                <div className="paper-copy">
                  <p className="paper-index">PUBLICATION {paper.id}</p>
                  <h3 aria-label={paper.title.join(" ")}>
                    {paper.title.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </h3>
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
          <p className="section-footer reveal" aria-hidden="true">
            <span className="section-footer-index"><b>03</b> {"// RESEARCH LAYER"}</span>
            <span className="section-footer-rule" />
          </p>
        </section>

        <section
          className="section contact grid-surface"
          id="contact"
          aria-labelledby="contact-title"
          tabIndex={-1}
        >
          <div className="contact-trace trace-in" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <div className="contact-trace trace-out" aria-hidden="true">
            <i /><i /><i /><i /><span>➤</span>
          </div>

          <div className="contact-inner">
            <h2 className="section-kicker reveal" id="contact-title">
              <span>CONTACT.CHANNEL</span>
              <span className="kicker-rule" aria-hidden="true" />
              <span className="square-end" aria-hidden="true" />
            </h2>

            <header className="contact-primary reveal">
              <p className="contact-channel">GET IN TOUCH</p>
              <h2 className="contact-heading">
                SEND A
                <span>SIGNAL.</span>
              </h2>
              <p className="contact-note">COLLABORATION · RESEARCH · TECHNICAL EXCHANGE</p>
            </header>

            <nav className="contact-directory reveal" aria-label="Contact channels">
              <p className="directory-heading">CONTACT ENDPOINTS</p>
              <ul className="contact-socials">
                <li>
                  <a href="mailto:jaxonhu01@gmail.com" aria-label="Email · jaxonhu01@gmail.com">
                    <span className="endpoint-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M2.5 7.2 12 13l9.5-5.8V6.5A2.5 2.5 0 0 0 19 4H5a2.5 2.5 0 0 0-2.5 2.5v.7Z" />
                        <path d="M21.5 9.3 12 15 2.5 9.3v8.2A2.5 2.5 0 0 0 5 20h14a2.5 2.5 0 0 0 2.5-2.5V9.3Z" />
                      </svg>
                    </span>
                    <span className="endpoint-copy"><b>EMAIL</b><small>jaxonhu01@gmail.com</small></span>
                    <span className="endpoint-arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
                <li>
                  <a href="https://github.com/JaxonHu1024" target="_blank" rel="noreferrer noopener" aria-label="GitHub · JaxonHu1024">
                    <span className="endpoint-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11 11 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5Z" />
                      </svg>
                    </span>
                    <span className="endpoint-copy"><b>GITHUB</b><small>JaxonHu1024</small></span>
                    <span className="endpoint-arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
                <li>
                  <a href="https://x.com/HuEnzo33232" target="_blank" rel="noreferrer noopener" aria-label="X · HuEnzo33232">
                    <span className="endpoint-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M18.24 2.25h3.31l-7.23 8.26L22.83 21.75h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
                      </svg>
                    </span>
                    <span className="endpoint-copy"><b>X / TWITTER</b><small>@HuEnzo33232</small></span>
                    <span className="endpoint-arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
                <li>
                  <a href="https://www.linkedin.com/in/jaxon-hu-10977a221/?lipi=urn%3Ali%3Apage%3Ad_flagship3_profile_view_base_contact_details%3BKILu4juHSq2jTdt856M16A%3D%3D" target="_blank" rel="noreferrer noopener" aria-label="LinkedIn · Jaxon">
                    <span className="endpoint-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.44-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
                      </svg>
                    </span>
                    <span className="endpoint-copy"><b>LINKEDIN</b><small>Jaxon</small></span>
                    <span className="endpoint-arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
              </ul>
            </nav>

            <footer className="site-footer reveal">JAXON / 2026</footer>
          </div>
        </section>
      </main>
    </>
  );
}
