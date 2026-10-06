import './style.css';
import './mobile.css';
import './form-r2.css';
import './ma-brand.css';
import './form-ma-modern.css';

// GitHub Pages build revision: assets are resolved relative to the page.

const form = document.querySelector('#vehicle-form');
const steps = [...document.querySelectorAll('.form-step')];
const nextButton = document.querySelector('#next-button');
const backButton = document.querySelector('#back-button');
const submitButton = document.querySelector('#submit-button');
const stepLabel = document.querySelector('#step-label');
const stepTitle = document.querySelector('#step-title');
const progressBar = document.querySelector('#progress-bar');
const titles = ['Seu objetivo', 'Valor desejado', 'Entrada disponível', 'Parcela mensal', 'Prazo', 'Seus dados'];
const metaCapiUrl = import.meta.env.VITE_META_CAPI_URL;
const attributionKeys = [
  'origem_conta',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_term',
  'utm_content',
  'ad_id',
  'adset_id',
];
const attribution = Object.fromEntries(
  attributionKeys
    .map((key) => [key, new URLSearchParams(window.location.search).get(key)])
    .filter(([, value]) => value),
);
let currentStep = 0;

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function createEventId() {
  return `lead_${crypto.randomUUID()}`;
}

function isStepValid() {
  const step = steps[currentStep];
  const radios = [...step.querySelectorAll('input[type="radio"]')];
  if (radios.length) return radios.some((input) => input.checked);
  return [...step.querySelectorAll('[required]')].every((input) => input.value.trim() && input.checkValidity());
}

function updateStep() {
  form.dataset.currentStep = String(currentStep);
  steps.forEach((step, index) => step.classList.toggle('is-active', index === currentStep));
  const progress = ((currentStep + 1) / steps.length) * 100;
  stepLabel.textContent = `Etapa ${currentStep + 1} de ${steps.length}`;
  stepTitle.textContent = titles[currentStep];
  progressBar.style.width = `${progress}%`;
  backButton.disabled = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;
  nextButton.disabled = !isStepValid();
  submitButton.disabled = !isStepValid();
}

form.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'whatsapp') {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) event.target.value = digits;
    else if (digits.length <= 7) event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    else event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length === 11 ? 7 : 6)}-${digits.slice(digits.length === 11 ? 7 : 6)}`;
  }
  nextButton.disabled = !isStepValid();
  submitButton.disabled = !isStepValid();
});

nextButton.addEventListener('click', () => {
  if (!isStepValid()) return;
  currentStep += 1;
  updateStep();
});

backButton.addEventListener('click', () => {
  currentStep -= 1;
  updateStep();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (currentStep !== steps.length - 1 || !isStepValid()) return;
  const data = new FormData(form);
  const fullName = String(data.get('nome'));
  const whatsapp = String(data.get('whatsapp'));
  const city = String(data.get('cidade'));
  const { firstName, lastName } = splitName(fullName);
  const eventId = createEventId();
  const message = [
    'Olá, MA Comércio! Fiz uma simulação pelo site:',
    '',
    `Nome: ${fullName}`,
    `WhatsApp: ${whatsapp}`,
    `Cidade: ${city}`,
    `Objetivo: ${data.get('objetivo')}`,
    `Valor aproximado: ${Number(data.get('valor')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`,
    `Entrada disponível: ${data.get('entrada')}`,
    `Parcela ideal: ${data.get('parcela')}`,
    `Prazo: ${data.get('prazo')}`,
  ].join('\n');
  const whatsappUrl = `https://wa.me/5593991207140?text=${encodeURIComponent(message)}`;

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando simulação…';
  window.fbq?.('track', 'Lead', {}, { eventID: eventId });

  if (metaCapiUrl) {
    // Keep the lead submission alive after navigation without making the user
    // wait for Meta, webhooks and GitHub archival to finish on the Worker.
    void fetch(metaCapiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_name: 'Lead',
        event_id: eventId,
        event_source_url: window.location.href,
        lead_data: {
          nome: fullName,
          whatsapp,
          cidade: city,
          objetivo: data.get('objetivo'),
          valor: Number(data.get('valor')),
          entrada: data.get('entrada'),
          parcela: data.get('parcela'),
          prazo: data.get('prazo'),
          origem: 'simulador_autoprime',
          received_at: new Date().toISOString(),
          ...attribution,
        },
        user_data: {
          ph: whatsapp,
          fn: firstName,
          ln: lastName,
          ct: city,
          fbp: getCookie('_fbp'),
          fbc: getCookie('_fbc'),
        },
        custom_data: {
          content_name: 'Simulador MA Comércio',
          content_category: 'Veículos',
          lead_type: 'simulador_autoprime',
          value: Number(data.get('valor')),
          currency: 'BRL',
          ...attribution,
        },
      }),
    }).then((response) => {
      if (!response.ok) throw new Error(`Falha ao registrar a conversão: HTTP ${response.status}.`);
    }).catch((error) => {
      console.error('Não foi possível registrar a simulação em segundo plano:', error);
    });
  } else {
    console.error('Endpoint da API de conversões não configurado.');
  }

  window.location.assign(whatsappUrl);
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.14 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
updateStep();
