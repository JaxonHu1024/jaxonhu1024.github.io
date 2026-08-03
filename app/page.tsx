import { Navigation } from "./components/Navigation";
import { HeroPixelPortrait } from "./components/HeroPixelPortrait";
import { ResearchVisual } from "./components/ResearchVisual";
import { TravelMap } from "./components/TravelMap";

const currentExperience = {
  company: "ByteDance",
};

const alibabaExperiences = [
  {
    organization: "International Digital Commerce Group",
  },
  {
    organization: "DAMO Academy",
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
    year: "2022",
    href: "https://ieeexplore.ieee.org/document/9831898",
    visual: "wave" as const,
  },
  {
    id: "02",
    title: ["Road-Network-Based", "Fast Geolocalization"],
    venue: "IEEE Transactions on Geoscience and Remote Sensing",
    year: "2021",
    href: "https://ieeexplore.ieee.org/document/9170807",
    visual: "road" as const,
  },
];

const contactMessage = "For project collaborations, technical consulting, or career opportunities, feel free to reach out.";
const currentYear = new Date().getUTCFullYear();

const aboutWorkingLoop = [
  {
    index: "01",
    label: "FRAME",
    detail: "Define scope.",
    outcome: "BOUNDARY",
  },
  {
    index: "02",
    label: "CONNECT",
    detail: "Join models and tools.",
    outcome: "SYSTEM",
  },
  {
    index: "03",
    label: "OBSERVE",
    detail: "Expose state and failures.",
    outcome: "CLARITY",
  },
  {
    index: "04",
    label: "VERIFY",
    detail: "Make claims reproducible.",
    outcome: "EVIDENCE",
  },
] as const;

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Navigation />
      <main className="site-canvas" id="content" tabIndex={-1}>
        <section className="section hero" id="hero" aria-labelledby="hero-title" tabIndex={-1}>
          <div className="hero-layout">
            <header className="hero-copy">
              <h1 className="hero-name" id="hero-title">
                JAXON
              </h1>
            </header>
            <HeroPixelPortrait />
            <div className="hero-actions">
              <a className="signal-button hero-cta" href="#about">
                <span className="hero-cta-label">About me</span>
                <span className="hero-cta-border" aria-hidden="true">
                  <svg
                    viewBox="0 0 100 40"
                    preserveAspectRatio="none"
                    focusable="false"
                  >
                    <rect
                      className="hero-cta-border-track"
                      x="1"
                      y="1"
                      width="98"
                      height="38"
                      pathLength="100"
                    />
                    <rect
                      className="hero-cta-border-signal"
                      x="1"
                      y="1"
                      width="98"
                      height="38"
                      pathLength="100"
                    />
                  </svg>
                </span>
              </a>
            </div>
          </div>
        </section>

        <section
          className="section about"
          id="about"
          aria-labelledby="about-title"
          tabIndex={-1}
        >
          <div className="about-layout reveal">
            <header className="about-copy">
              <p className="about-kicker">JAXON.CONTEXT</p>
              <h2 className="about-statement" id="about-title">
                <span>From model capability</span>
                <span>to system behavior.</span>
              </h2>
              <p className="about-introduction">
                I&apos;m Jaxon. I build inspectable systems where models, tools, and
                decisions meet the real world—with a focus on agents, multimodal
                systems, and autonomous intelligence.
              </p>
            </header>

            <TravelMap />

            <section className="about-working-loop" aria-labelledby="about-loop-title">
              <header className="about-loop-header">
                <p>Working loop</p>
                <h3 id="about-loop-title">How I work.</h3>
              </header>

              <ol className="about-loop-list">
                {aboutWorkingLoop.map((stage) => (
                  <li className="about-loop-step" key={stage.index}>
                    <p className="about-loop-heading">
                      <span className="about-loop-node" aria-hidden="true" />
                      <span className="about-loop-index">{stage.index}</span>
                      <span className="about-loop-label">{stage.label}</span>
                    </p>
                    <p className="about-loop-detail">{stage.detail}</p>
                    <p className="about-loop-outcome">
                      <strong>{stage.outcome}</strong>
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </section>

        <section
          className="section experience"
          id="experience"
          aria-labelledby="experience-title"
          tabIndex={-1}
        >
          <h2 className="section-kicker reveal" id="experience-title">
            <span>EXPERIENCE.LOG</span>
            <span className="kicker-rule" aria-hidden="true" />
            <span className="square-end" aria-hidden="true" />
          </h2>
          <div className="experience-log">
            <article className="experience-row is-current">
              <div className="timeline-cell" aria-hidden="true">
                <span className="timeline-node" />
                <span className="node-lead" />
              </div>
              <div className="experience-copy">
                <div className="experience-entry-heading">
                  <div className="experience-entry-copy">
                    <h3>{currentExperience.company}</h3>
                    <p>Senior AI Engineer</p>
                  </div>
                  {/* Static export serves the user-provided SVG directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="experience-brand-logo experience-brand-logo--bytedance"
                    src="/assets/logo-bytedance-color.svg"
                    alt=""
                    width="16"
                    height="16"
                    loading="lazy"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </article>

            <section className="experience-group" aria-labelledby="alibaba-group-title">
              <header className="experience-group-header">
                <span className="experience-group-branch" aria-hidden="true" />
                <div className="experience-group-heading">
                  <div className="experience-entry-copy">
                    <h3 id="alibaba-group-title">Alibaba</h3>
                    <p>Machine Learning Engineer</p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="experience-brand-logo experience-brand-logo--alibaba"
                    src="/assets/logo-alibaba-color.svg"
                    alt=""
                    width="16"
                    height="16"
                    loading="lazy"
                    aria-hidden="true"
                  />
                </div>
              </header>
              <div className="experience-subentries">
                {alibabaExperiences.map((item) => (
                  <article className="experience-subentry" key={item.organization}>
                    <div className="experience-subentry-copy">
                      <h4>{item.organization}</h4>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section
          className="section foundations"
          id="foundations"
          aria-labelledby="foundations-title"
          tabIndex={-1}
        >
          <h2 className="section-kicker section-kicker--compact reveal" id="foundations-title">
            <span>FOUNDATIONS.INDEX</span>
          </h2>
          <div className="foundations-grid reveal">
            <div className="education-column">
              <div className="column-label">
                <span>EDUCATION</span>
                <span className="label-rule" aria-hidden="true" />
                <span className="square-end" aria-hidden="true" />
              </div>
              <div className="education-timeline">
                <article className="education-item has-crest">
                  <span className="education-node" aria-hidden="true" />
                  {/* Static export serves the local SVG directly; Next image optimizer is not used. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="education-crest education-crest--ntu"
                    src="/assets/logo-ntu.svg"
                    alt=""
                    width="117"
                    height="150"
                    loading="lazy"
                    aria-hidden="true"
                  />
                  <h3>Nanyang Technological University</h3>
                  <p>MSc in Computer Control and Automation</p>
                </article>
                <article className="education-item has-crest">
                  <span className="education-node" aria-hidden="true" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="education-crest education-crest--seu"
                    src="/assets/logo-seu-color.svg"
                    alt=""
                    width="189"
                    height="189"
                    loading="lazy"
                    aria-hidden="true"
                  />
                  <h3>Southeast University</h3>
                  <p>BEng in Electrical Engineering and Automation</p>
                </article>
              </div>
            </div>
            <div className="toolchain-column">
              <div className="column-label">
                <span>TOOLCHAIN</span>
                <span className="label-rule" aria-hidden="true" />
                <span className="square-end" aria-hidden="true" />
              </div>
              <dl className="toolchain-list" aria-label="Technical toolchain">
                <div className="toolchain-module">
                  <dt>AI SPECIALTIES</dt>
                  <dd><span>AI Agents</span><span>AIGC</span><span>LLMs</span><span>VLMs</span><span>Autonomous Driving</span></dd>
                </div>
                <div className="toolchain-module">
                  <dt>LANGUAGES</dt>
                  <dd><span>Python</span><span>C++</span><span>SQL</span></dd>
                </div>
                <div className="toolchain-module">
                  <dt>PLATFORM</dt>
                  <dd><span>Linux</span><span>Docker</span></dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section
          className="section research"
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
                  <time className="paper-meta" dateTime={paper.year}>{paper.year}</time>
                  <a className="paper-link" href={paper.href} target="_blank" rel="noreferrer">
                    <span>VIEW PAPER</span>
                    <span className="paper-link-arrow" aria-hidden="true">↗</span>
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
          className="section contact"
          id="contact"
          aria-labelledby="contact-title"
          tabIndex={-1}
        >
          <div className="contact-inner">
            <h2 className="section-kicker section-kicker--compact reveal" id="contact-title">
              <span>CONTACT.CHANNEL</span>
            </h2>

            <div className="contact-marquee reveal">
              <p className="contact-marquee-summary">{contactMessage}</p>
              <div className="contact-marquee-window">
                <div className="contact-marquee-track" aria-hidden="true">
                  {[0, 1].map((group) => (
                    <span className="contact-marquee-group" key={group}>
                      {[0, 1, 2].map((repeat) => (
                        <span className="contact-marquee-item" key={repeat}>
                          <span>{contactMessage}</span>
                          <span className="contact-marquee-separator">{"//"}</span>
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <nav className="contact-directory reveal" aria-label="Contact channels">
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
                    <span className="endpoint-arrow" aria-hidden="true">→</span>
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
                    <span className="endpoint-arrow" aria-hidden="true">→</span>
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
                    <span className="endpoint-arrow" aria-hidden="true">→</span>
                  </a>
                </li>
                <li>
                  <a href="https://www.linkedin.com/in/jaxon-hu-10977a221/" target="_blank" rel="noreferrer noopener" aria-label="LinkedIn · Jaxon">
                    <span className="endpoint-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.44-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
                      </svg>
                    </span>
                    <span className="endpoint-copy"><b>LINKEDIN</b><small>Jaxon</small></span>
                    <span className="endpoint-arrow" aria-hidden="true">→</span>
                  </a>
                </li>
              </ul>
            </nav>

            <footer className="site-footer reveal">JAXON / {currentYear}</footer>
          </div>
        </section>
      </main>
    </>
  );
}
