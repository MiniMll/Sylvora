// Single source of truth para las preguntas de la landing.
// Lo consumen DOS lugares:
//   1. components/landing/FAQ.tsx → render visible.
//   2. components/landing/JsonLd.tsx → estructura schema.org FAQPage
//      para que Google muestre las preguntas como rich results.
//
// Si cambia una pregunta/respuesta acá, se actualiza en los dos
// lugares automáticamente.

export interface QA {
  pregunta: string
  respuesta: string
}

export const FAQS: QA[] = [
  {
    pregunta: '¿Tengo que comprar algo además del celular?',
    respuesta:
      'No. Si tu teléfono tiene cámara y se conecta a internet, ya está. La impresora térmica es opcional — también podés mandar el ticket por WhatsApp.',
  },
  {
    pregunta: '¿Sirve si soy yo solo, sin empleados?',
    respuesta:
      'Sí. Lo usás con una sola cuenta. Cuando crezcas y tomes a alguien, sumás un usuario más sin tocar nada.',
  },
  {
    pregunta: '¿Funciona con cualquier impresora térmica?',
    respuesta:
      'Con cualquier térmica de 80mm con USB o Bluetooth. Si no tenés impresora, el ticket lo mandás por WhatsApp en un toque.',
  },
  {
    pregunta: '¿Sirve para vender por kilo o por litro?',
    respuesta:
      'Sí. Cargás el precio por kg, litro o metro. Pensado para fiambrería, panificados, gaseosas sueltas y todo lo que no se vende por unidad.',
  },
  {
    pregunta: '¿Puedo anular una venta?',
    respuesta:
      'Sí, los administradores pueden anular una venta. El stock vuelve automáticamente.',
  },
  {
    pregunta: '¿Pueden ver mis ventas otras personas?',
    respuesta:
      'Solo vos y los empleados que invites a tu comercio. Cada uno tiene su rol — el dueño ve todo, el empleado solo lo que tiene que ver.',
  },
  {
    pregunta: '¿Qué pasa con mis datos si dejo de usarlo?',
    respuesta:
      'Te los exportamos en Excel cuando los necesites y los borramos cuando nos lo pidas. Son tuyos, no nuestros.',
  },
  {
    pregunta: '¿Hay contrato? ¿Y cómo me cobran?',
    respuesta:
      'No hay contrato. Probás 30 días sin tarjeta y cuando se termina te avisamos. Si no querés seguir, no hacés nada — no podemos cobrarte porque no nos diste tu tarjeta.',
  },
]
