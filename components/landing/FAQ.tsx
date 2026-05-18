'use client'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { useInView } from './lib/useInView'
import { FAQS, type QA } from './data/faqs'

// FAQ con <details>/<summary> nativo: accesible, sin JS, sin estado
// que sincronizar. El caret rota con CSS via [open] selector.
//
// Disciplina (docs/landing-spec.md §4.8 + nota del usuario):
// - 8 preguntas, no 10. Las que el dueño REALMENTE se hace.
// - Respuestas máx 2 frases.
// - Cero corporate-speak ("solución 360", "potenciá tu negocio", etc.).
// - Cero exageración. Si una feature no existe, no la prometo.
//
// Cosas que CONSCIENTEMENTE omito:
// - Offline / "sin internet". No hay service worker todavía. Mentir
//   acá = churn al primer corte de luz.
// - Método de cobro específico. MP suscripción todavía no está
//   integrado, así que digo "te avisamos antes que termine el trial"
//   y nada más.
// - "Soporte 24/7". Es WhatsApp humano en horario comercial.
//
// Las preguntas viven en ./data/faqs.ts (single source of truth) —
// también las consume JsonLd para emitir schema.org FAQPage.

function FAQItem({ qa }: { qa: QA }) {
  const { ref, inView } = useInView<HTMLDetailsElement>()
  return (
    <details
      ref={ref}
      className={`faq-item landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
    >
      <summary className="faq-question">
        <span>{qa.pregunta}</span>
        <span className="faq-caret" aria-hidden="true">+</span>
      </summary>
      <div className="faq-answer">{qa.respuesta}</div>
    </details>
  )
}

export function FAQ() {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <Section background="bg" paddingY="lg" id="preguntas">
      <Container maxWidth={720}>
        <div
          ref={ref}
          className={`landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
          style={{ textAlign: 'center' }}
        >
          <h2 className="landing-h2">Lo que nos preguntan.</h2>
          <p className="landing-sub" style={{ marginTop: 16 }}>
            Si quedó algo afuera, escribinos por WhatsApp.
          </p>
        </div>

        <div className="faq-list">
          {FAQS.map((qa) => (
            <FAQItem key={qa.pregunta} qa={qa} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
