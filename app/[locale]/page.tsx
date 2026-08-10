import Link from "next/link";
import { ArrowRight, BookOpen, Route, Search } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";

const directAnswers = [
  {
    question: "¿Jesús es Dios?",
    answer: "Sigue el testimonio bíblico acerca de la Deidad de Jesucristo."
  },
  {
    question: "¿Por qué oraba Jesús?",
    answer: "Examina lo que la Escritura revela acerca de su verdadera humanidad."
  },
  {
    question: "¿Qué significa la diestra de Dios?",
    answer: "Lee los pasajes en su contexto y sigue el lenguaje bíblico de autoridad y exaltación."
  },
  {
    question: "¿Por qué bautizaban en el nombre de Jesús?",
    answer: "Compara el mandato de Jesús con la práctica registrada de los apóstoles."
  },
  {
    question: "¿Qué significa nacer de nuevo?",
    answer: "Sigue la enseñanza de Jesús y la respuesta apostólica al evangelio."
  }
] as const;

const topics = [
  { category: "DIOS", title: "Dios es uno", claim: "Un solo Dios. Un solo Señor. Una sola identidad divina." },
  { category: "CRISTOLOGÍA", title: "Jesús es Dios", claim: "La Escritura presenta a Jesucristo como la revelación visible del Dios invisible." },
  { category: "ENCARNACIÓN", title: "El Verbo se hizo carne", claim: "Sigue el testimonio bíblico desde el Verbo hasta la manifestación en carne." },
  { category: "SALVACIÓN", title: "El nuevo nacimiento", claim: "Examina el arrepentimiento, el bautismo y el Espíritu Santo desde el texto." },
  { category: "BAUTISMO", title: "El nombre de Jesús", claim: "Compara Mateo 28:19 con la práctica apostólica registrada en Hechos." }
] as const;

const pathways = [
  { title: "Dios es uno", label: "Doctrina · Identidad divina" },
  { title: "Jesús es Dios", label: "Cristología · Encarnación" },
  { title: "El nuevo nacimiento", label: "Salvación · Nuevo nacimiento" },
  { title: "Mateo 28:19 y Hechos 2:38", label: "Bautismo · Práctica apostólica" },
  { title: "La diestra de Dios", label: "Interpretación · Pregunta común" }
] as const;

const studies = [
  {
    eyebrow: "CRISTOLOGÍA",
    title: "El Padre mora en el Hijo",
    summary: "Lee Juan 14 siguiendo las palabras de Jesús y la relación entre el Dios invisible y su manifestación en carne."
  },
  {
    eyebrow: "ENCARNACIÓN",
    title: "El Hijo nació",
    summary: "Traza el lenguaje bíblico acerca del nacimiento del Hijo, la promesa y la encarnación."
  },
  {
    eyebrow: "DOCTRINA",
    title: "Toda la plenitud de la Deidad",
    summary: "Examina Colosenses 2:9 en contexto y sigue sus conexiones con otros pasajes acerca de Cristo."
  },
  {
    eyebrow: "SALVACIÓN",
    title: "Bautismo en el nombre de Jesús",
    summary: "Sigue cada relato bautismal registrado en Hechos y compáralos directamente con el mandato de Cristo."
  }
] as const;

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) notFound();

  // English stays on the existing production homepage. This route never renders an English clone.
  if (locale === "en") redirect("/");

  return (
    <div className="editorial-interface" lang="es">
      <section className="ei-hero">
        <div className="shell ei-hero-grid">
          <div className="ei-hero-copy">
            <div className="ei-system-label">
              <span>Escritura · Doctrina · Respuestas</span>
              <span>Buscar · Estudiar · Entender</span>
            </div>
            <span className="ei-kicker">Primero la Escritura. Las preguntas son bienvenidas.</span>
            <h1>Conoce lo que crees.<span>Conoce por qué.</span></h1>
            <p>Busca en la Escritura, sigue pasajes conectados y entiende la doctrina apostólica desde el texto mismo.</p>
            <div className="ei-actions">
              <Link className="button button-crimson" href="#buscar">Buscar en la Escritura <Search size={17} /></Link>
              <Link className="button button-outline" href="#temas">Explorar temas <ArrowRight size={17} /></Link>
            </div>
          </div>

          <aside className="ei-live-index" aria-label="Guía bíblica conectada">
            <header><span>Guía bíblica</span><span>Pasajes conectados</span></header>
            <div className="ei-index-query"><Search size={16} /><span>¿Por qué oraba Jesús?</span><b>↵</b></div>
            <div className="ei-index-result ei-index-featured">
              <div><span>Mejor resultado</span><span>Juan 14:9–11</span></div>
              <h2>El Padre que mora en mí, él hace las obras.</h2>
              <p>“El que me ha visto a mí, ha visto al Padre...”</p>
              <span>Próximamente en Guía Apostólica</span>
            </div>
            <div className="ei-index-links">
              {directAnswers.slice(0, 3).map((answer, index) => (
                <a href="#respuestas" key={answer.question}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{answer.question}</strong>
                  <ArrowRight size={14} />
                </a>
              ))}
            </div>
            <footer><span>Escritura · Doctrina · Respuestas</span><span>Sigue la evidencia</span></footer>
          </aside>
        </div>
      </section>

      <section className="ei-search" id="buscar">
        <div className="shell ei-section-grid">
          <div className="ei-section-intro">
            <span className="ei-section-number">01</span>
            <span className="ei-kicker">Búsqueda bíblica</span>
            <h2>Comienza con la pregunta que tienes delante.</h2>
          </div>
          <div className="ei-search-control">
            <div className="search-form" role="search" aria-label="Vista previa de búsqueda en español">
              <div className="search-input-wrap">
                <Search size={20} />
                <input aria-label="Buscar en las Escrituras" placeholder="Busca una pregunta, tema o versículo..." readOnly />
                <button className="button button-crimson" type="button" disabled>Buscar</button>
              </div>
            </div>
            <div className="ei-search-suggestions" aria-label="Búsquedas sugeridas">
              <span>Prueba</span>
              <button type="button">¿Jesús es Dios?</button>
              <button type="button">¿Por qué oraba Jesús?</button>
              <button type="button">La diestra de Dios</button>
              <button type="button">Bautismo en el nombre de Jesús</button>
            </div>
          </div>
        </div>
      </section>

      <section className="ei-questions" id="respuestas">
        <div className="shell ei-section-heading">
          <div>
            <span className="ei-section-number">02</span>
            <span className="ei-kicker">Respuestas directas</span>
            <h2>Comienza con la pregunta real.</h2>
          </div>
          <p>Lee primero la respuesta directa. Luego examina los pasajes, el contexto y la evidencia conectada.</p>
        </div>

        <div className="shell ei-question-index">
          {directAnswers.map((answer, index) => (
            <div className="ei-question-row" key={answer.question} data-reveal>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{answer.question}</h3>
              <p>{answer.answer}</p>
              <span className="ei-row-action"><ArrowRight size={18} /></span>
            </div>
          ))}
          <span className="ei-index-footer-link">Biblioteca de respuestas en preparación</span>
        </div>
      </section>

      <section className="ei-topics" id="temas">
        <div className="shell ei-section-heading ei-section-heading-dark">
          <div>
            <span className="ei-section-number">03</span>
            <span className="ei-kicker ei-kicker-light">Biblioteca doctrinal</span>
            <h2>Sigue todo el caso bíblico.</h2>
          </div>
          <p>Una afirmación. Pasajes clave. Objeciones comunes. Un próximo paso claro.</p>
        </div>

        <div className="shell ei-topic-interface">
          <div className="ei-topic-rail" aria-hidden="true">
            <span>Temas</span><span>En preparación</span><span>Guía Apostólica</span>
          </div>
          <div className="ei-topic-list">
            {topics.map((topic, index) => (
              <div className="ei-topic-row" key={topic.title} data-reveal>
                <span className="ei-topic-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <span className="ei-topic-category">{topic.category}</span>
                  <h3>{topic.title}</h3>
                </div>
                <p>{topic.claim}</p>
                <span className="ei-topic-arrow"><ArrowRight size={19} /></span>
                <span className="ei-topic-word" aria-hidden>{topic.title.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ei-pathway" id="rutas">
        <div className="shell ei-pathway-grid">
          <div className="ei-pathway-copy">
            <span className="ei-section-number">04</span>
            <span className="ei-kicker">Rutas Bíblicas</span>
            <h2>Construye la doctrina. Sigue la ruta.</h2>
            <p>Elige el estudio que corresponde a la pregunta que tienes delante. Cada ruta establece un núcleo bíblico y después te lleva a un estudio más profundo.</p>
            <div className="ei-pathway-meta">
              <span>20 rutas iniciales</span>
              <span>Doctrina y salvación</span>
              <span>Primero la Escritura</span>
            </div>
            <span className="button button-dark" aria-disabled="true">Rutas en preparación <Route size={17} /></span>
          </div>

          <div className="ei-pathway-interface" data-reveal>
            <header><span>Biblioteca de rutas</span><span>Estudios iniciales</span></header>
            <div className="ei-pathway-track">
              {pathways.map((pathway, index) => (
                <div className="ei-pathway-step" key={pathway.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{pathway.title}</strong><small>{pathway.label}</small></div>
                  <ArrowRight size={16} />
                </div>
              ))}
            </div>
            <footer>
              <span>Doctrina · Salvación · Preguntas</span>
              <span>Próximamente</span>
            </footer>
          </div>
        </div>
      </section>

      <section className="ei-editorial">
        <div className="shell ei-editorial-heading">
          <div>
            <span className="ei-section-number">05</span>
            <span className="ei-kicker">Estudios</span>
            <h2>Profundiza en el texto.</h2>
          </div>
          <p>Estudios enfocados que siguen la Escritura, el contexto y los pasajes conectados sin evitar las preguntas difíciles.</p>
        </div>
        <div className="shell ei-poster-grid">
          {studies.map((study, index) => (
            <article className={`article-poster article-poster-${(index % 4) + 1}`} key={study.title}>
              <div className="article-poster-inner">
                <span className="article-poster-eyebrow">{study.eyebrow}</span>
                <h3>{study.title}</h3>
                <p>{study.summary}</p>
                <span className="article-poster-link">En preparación <ArrowRight size={15} /></span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ei-declaration">
        <div className="shell ei-declaration-grid">
          <div>
            <span className="ei-section-number">06</span>
            <span className="ei-kicker ei-kicker-light">Guía Apostólica</span>
            <h2>Jesús es Dios.<br />La Escritura guía la conversación.</h2>
          </div>
          <div className="ei-declaration-side">
            <p>La verdad merece ser entendida, no solamente repetida.</p>
            <div>
              <a className="button button-paper" href="#buscar">Explorar la Escritura <BookOpen size={17} /></a>
              <Link className="button button-outline ei-outline-light" href="/">English <ArrowRight size={17} /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
