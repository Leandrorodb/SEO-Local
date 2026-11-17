/**
 * Local-first, zero-API-cost keyword discovery.
 * Generates REVIEW CANDIDATES, never ranking positions or claims that a service exists.
 * Specialty services are only added when an operator has confirmed them.
 */
export type Priority = 'P1' | 'P2';
export type SuggestedTerm = { query: string; cluster: string; priority: Priority };
export type NicheDefinition = {
  value: string;
  title: string;
  aliases: string[];
  categories: string[];
  intent: 'consultation' | 'booking' | 'purchase' | 'service' | 'generic';
};

export const NICHES: readonly NicheDefinition[] = [
  { value:'pousada', title:'Pousadas', aliases:['pousada','hospedagem rural'], categories:['pousada','hospedagem','onde ficar'], intent:'booking' },
  { value:'hotel', title:'Hotéis', aliases:['hotel','hostel'], categories:['hotel','hospedagem','onde ficar'], intent:'booking' },
  { value:'chales', title:'Chalés', aliases:['chale','chalés','chalé'], categories:['chalé','chalés','hospedagem em chalé'], intent:'booking' },
  { value:'restaurante', title:'Restaurantes', aliases:['restaurante','churrascaria','bistro','bistrô'], categories:['restaurante','onde almoçar','onde jantar'], intent:'booking' },
  { value:'pizzaria', title:'Pizzarias', aliases:['pizzaria','pizza'], categories:['pizzaria','pizza','onde comer pizza'], intent:'purchase' },
  { value:'cafeteria', title:'Cafeterias', aliases:['cafeteria','cafe gourmet','café gourmet'], categories:['cafeteria','café','café da manhã'], intent:'purchase' },
  { value:'padaria', title:'Padarias', aliases:['padaria','panificadora'], categories:['padaria','pães','panificadora'], intent:'purchase' },
  { value:'moveis', title:'Lojas de móveis', aliases:['moveis','móveis','mobiliario','mobiliário'], categories:['loja de móveis','móveis','comprar móveis'], intent:'purchase' },
  { value:'moveis_planejados', title:'Móveis planejados', aliases:['moveis planejados','móveis planejados','marcenaria planejada'], categories:['móveis planejados','projeto de móveis planejados','marcenaria'], intent:'service' },
  { value:'imobiliaria', title:'Imobiliárias', aliases:['imobiliaria','imobiliária','imoveis','imóveis'], categories:['imobiliária','corretor de imóveis','imóveis'], intent:'service' },
  { value:'material_construcao', title:'Materiais de construção', aliases:['materiais de construcao','material de construção','construcao materiais','casa de materiais'], categories:['materiais de construção','loja de material de construção','material para obra'], intent:'purchase' },
  { value:'construtora', title:'Construtoras', aliases:['construtora','construcao civil','construção civil'], categories:['construtora','empresa de construção civil','obras'], intent:'service' },
  { value:'marmoraria', title:'Marmorarias', aliases:['marmoraria','marmores','mármores','granitos'], categories:['marmoraria','mármore','granito'], intent:'service' },
  { value:'vidracaria', title:'Vidraçarias', aliases:['vidracaria','vidros temperados'], categories:['vidraçaria','vidros sob medida','instalação de vidros'], intent:'service' },
  { value:'otica', title:'Óticas', aliases:['otica','ótica','oculos','óculos'], categories:['ótica','loja de óculos','óculos de grau'], intent:'purchase' },
  { value:'farmacia', title:'Farmácias', aliases:['farmacia','farmácia','drogaria'], categories:['farmácia','drogaria','medicamentos'], intent:'purchase' },
  { value:'clinica_emagrecimento', title:'Clínicas de emagrecimento', aliases:['emagrecimento','emagrecentro','emagrecer','nutrologia'], categories:['clínica de emagrecimento','tratamento para emagrecimento','consulta para emagrecimento'], intent:'consultation' },
  { value:'clinica_estetica', title:'Clínicas de estética', aliases:['clinica estetica','clínica estética','estetica avancada','estética avançada'], categories:['clínica de estética','estética','tratamentos estéticos'], intent:'consultation' },
  { value:'clinica_medica', title:'Clínicas médicas', aliases:['clinica medica','clínica médica','consultorio medico','consultório médico','clinica','clínica'], categories:['clínica médica','consultório médico','consulta médica'], intent:'consultation' },
  { value:'odontologia', title:'Odontologia', aliases:['odontologia','dentista','odontologica','odontológica'], categories:['dentista','clínica odontológica','consulta odontológica'], intent:'consultation' },
  { value:'nutricao', title:'Nutrição', aliases:['nutricionista','nutricao','nutrição'], categories:['nutricionista','consulta com nutricionista','nutrição clínica'], intent:'consultation' },
  { value:'fisioterapia', title:'Fisioterapia', aliases:['fisioterapia','fisioterapeuta'], categories:['fisioterapia','clínica de fisioterapia','fisioterapeuta'], intent:'consultation' },
  { value:'psicologia', title:'Psicologia', aliases:['psicologia','psicologo','psicólogo','psicologa','psicóloga'], categories:['psicólogo','consultório de psicologia','consulta psicológica'], intent:'consultation' },
  { value:'laboratorio', title:'Laboratórios', aliases:['laboratorio','laboratório','analises clinicas','análises clínicas'], categories:['laboratório de análises clínicas','exames laboratoriais','laboratório'], intent:'service' },
  { value:'petshop', title:'Pet shops', aliases:['pet shop','petshop','banho e tosa'], categories:['pet shop','loja para animais','produtos para pets'], intent:'purchase' },
  { value:'veterinaria', title:'Clínicas veterinárias', aliases:['veterinaria','veterinária','veterinario','veterinário'], categories:['clínica veterinária','veterinário','consulta veterinária'], intent:'consultation' },
  { value:'academia', title:'Academias', aliases:['academia','fitness','crossfit'], categories:['academia','academia de musculação','treinamento físico'], intent:'service' },
  { value:'barbearia', title:'Barbearias', aliases:['barbearia','barber'], categories:['barbearia','corte de cabelo masculino','barbeiro'], intent:'service' },
  { value:'salao', title:'Salões de beleza', aliases:['salao de beleza','salão de beleza','cabeleireiro','cabeleireira'], categories:['salão de beleza','cabeleireiro','serviços de beleza'], intent:'service' },
  { value:'autopecas', title:'Autopeças', aliases:['autopecas','autopeças','pecas automotivas','peças automotivas'], categories:['loja de autopeças','autopeças','peças para carros'], intent:'purchase' },
  { value:'motopeças', title:'Motopeças', aliases:['moto pecas','moto peças','motopeças','motopecas'], categories:['loja de motopeças','peças de moto','acessórios para moto'], intent:'purchase' },
  { value:'oficina', title:'Oficinas mecânicas', aliases:['oficina mecanica','oficina mecânica','mecanica automotiva','mecânica automotiva'], categories:['oficina mecânica','mecânico de carros','manutenção automotiva'], intent:'service' },
  { value:'contabilidade', title:'Contabilidade', aliases:['contabilidade','contabil','contábil'], categories:['escritório de contabilidade','contador','serviços contábeis'], intent:'service' },
  { value:'advocacia', title:'Advocacia', aliases:['advocacia','advogado','advogada'], categories:['escritório de advocacia','advogado','assessoria jurídica'], intent:'consultation' },
  { value:'escola', title:'Escolas e cursos', aliases:['escola','colegio','colégio','curso de idiomas','escola de idiomas'], categories:['escola','cursos','matrícula escolar'], intent:'service' },
  { value:'autoescola', title:'Autoescolas', aliases:['autoescola','centro de formacao de condutores','centro de formação de condutores'], categories:['autoescola','habilitação','aulas de direção'], intent:'service' },
  { value:'locadora', title:'Locadoras', aliases:['locadora','aluguel de carros'], categories:['locadora','locação','aluguel'], intent:'booking' },
  { value:'lavanderia', title:'Lavanderias', aliases:['lavanderia','lavagem de roupas'], categories:['lavanderia','lavagem de roupas','serviço de lavanderia'], intent:'service' },
  { value:'limpeza', title:'Serviços de limpeza', aliases:['limpeza profissional','empresa de limpeza','higienizacao','higienização'], categories:['empresa de limpeza','limpeza profissional','serviços de limpeza'], intent:'service' },
  { value:'generico', title:'Não identificado — confirmar categoria', aliases:[], categories:[], intent:'generic' },
] as const;

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
function placeName(city: string) {
  return clean(city.replace(/\s*[\/,-]\s*(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*$/i, ''));
}
export function listNiches() { return NICHES.map(({ value, title }) => ({ value, title })); }
export function detectNiche(companyName: string): { niche: string; confidence: 'name_match' | 'unconfirmed' } {
  const name = ` ${norm(companyName)} `;
  const matches = NICHES.flatMap((n) => n.aliases
    .filter((alias) => name.includes(` ${norm(alias)} `))
    .map((alias) => ({ niche: n.value, strength: norm(alias).length })));
  matches.sort((a, b) => b.strength - a.strength);
  return matches.length
    ? { niche: matches[0].niche, confidence: 'name_match' }
    : { niche: 'generico', confidence: 'unconfirmed' };
}
export function suggestKeywords(input: {
  name: string;
  city: string;
  niche?: string;
  services?: string[];
  primaryCategory?: string;
  neighborhood?: string;
  limit?: number;
}): {
  terms: SuggestedTerm[];
  classification: { niche: string; title: string; confidence: 'name_match' | 'category_match' | 'operator' | 'unconfirmed' };
  reviewRequired: true;
  notice: string;
} {
  const city = placeName(input.city);
  const name = clean(input.name);
  if (!city || !name || /[<>\r\n]/.test(city + name)) throw Error('INVALID_BUSINESS_IDENTITY');
  const detectedByName = detectNiche(name);
  const detectedByCategory = detectNiche(input.primaryCategory ?? '');
  const infer = detectedByCategory.niche !== 'generico'
    ? { niche: detectedByCategory.niche, confidence: 'category_match' as const }
    : detectedByName;
  const selected = input.niche && input.niche !== 'auto' ? input.niche : infer.niche;
  const def = NICHES.find((n) => n.value === selected);
  if (!def) throw Error('UNKNOWN_NICHE');
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 40)));
  const serviceCandidates = (input.services ?? [])
    .map(clean).filter((v) => v.length >= 3 && v.length <= 100 && !/[<>\r\n]/.test(v)).slice(0, 30);
  const neighborhood = clean(input.neighborhood ?? '');
  if (neighborhood && (neighborhood.length > 100 || /[<>\r\n]/.test(neighborhood)))
    throw Error('INVALID_NEIGHBORHOOD');
  const seen = new Set<string>();
  const terms: SuggestedTerm[] = [];
  const add = (query: string, cluster: string, priority: Priority) => {
    const q = clean(query);
    if (!q || q.length > 240 || /[<>\r\n]/.test(q)) return;
    const k = norm(q);
    if (!k || seen.has(k) || terms.length >= limit) return;
    seen.add(k);
    terms.push({ query: q, cluster, priority });
  };
  // Broaden *search patterns*, never assert business amenities or specialties.
  // Specific procedures/products require operator confirmation in serviceCandidates.
  for (const [i, category] of def.categories.entries()) {
    add(`${category} em ${city}`, 'Categoria principal', i === 0 ? 'P1' : 'P2');
    add(`${category} ${city}`, 'Categoria principal', 'P2');
    add(`${category} perto de mim`, 'Localização e proximidade', i === 0 ? 'P1' : 'P2');
    if (neighborhood) {
      add(`${category} no ${neighborhood} ${city}`, 'Localização e proximidade', i === 0 ? 'P1' : 'P2');
      add(`${category} ${neighborhood}`, 'Localização e proximidade', 'P2');
    }
  }
  if (def.intent !== 'generic') {
    for (const [i, category] of def.categories.entries()) {
      add(`melhor ${category} em ${city}`, 'Comparação e descoberta', 'P2');
      add(`${category} bem avaliado em ${city}`, 'Comparação e descoberta', 'P2');
      if (def.intent === 'booking') {
        add(`reservar ${category} em ${city}`, 'Reserva e contratação', i === 0 ? 'P1' : 'P2');
        add(`${category} para reservar em ${city}`, 'Reserva e contratação', 'P2');
      } else if (def.intent === 'consultation') {
        add(`consulta de ${category} em ${city}`, 'Consulta e agendamento', i === 0 ? 'P1' : 'P2');
        add(`agendar consulta ${category} ${city}`, 'Consulta e agendamento', 'P2');
      } else if (def.intent === 'purchase') {
        add(`comprar ${category} em ${city}`, 'Compra e orçamento', i === 0 ? 'P1' : 'P2');
        add(`loja de ${category} ${city}`, 'Compra e orçamento', 'P2');
      } else if (def.intent === 'service') {
        add(`contratar ${category} em ${city}`, 'Contratação e orçamento', i === 0 ? 'P1' : 'P2');
        add(`orçamento de ${category} em ${city}`, 'Contratação e orçamento', 'P2');
      }
    }
  }
  for (const service of serviceCandidates) {
    add(`${service} em ${city}`, 'Serviços confirmados', 'P1');
    add(`${service} ${city}`, 'Serviços confirmados', 'P2');
    add(`${service} perto de mim`, 'Serviços confirmados', 'P2');
    if (neighborhood) add(`${service} ${neighborhood} ${city}`, 'Serviços confirmados', 'P2');
  }
  add(name, 'Marca', 'P1');
  add(`${name} ${city}`, 'Marca', 'P2');
  return {
    terms,
    classification: {
      niche: def.value,
      title: def.title,
      confidence: input.niche && input.niche !== 'auto' ? 'operator' : infer.confidence,
    },
    reviewRequired: true,
    notice: infer.confidence === 'unconfirmed' && (!input.niche || input.niche === 'auto')
      ? 'Nicho não reconhecido pelo nome. Confirme a categoria e os serviços antes de importar.'
      : 'Sugestões automáticas para revisão; não comprovam serviços, demanda ou ranking.',
  };
}
