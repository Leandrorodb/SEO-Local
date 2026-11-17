const norm=s=>String(s||'').trim().replace(/\s+/g,' ');
const categories={
 moveis:{title:'Lojas de móveis',clusters:{'Loja de móveis':['loja de móveis','móveis','comprar móveis','loja de mobiliário'],'Sofás e estofados':['loja de sofás','sofás','comprar sofá'],'Quartos':['camas','guarda-roupa','móveis para quarto'],'Salas':['móveis para sala','mesa de jantar','rack para sala']}},
 restaurante:{title:'Restaurantes',clusters:{'Restaurante':['restaurante','onde almoçar','almoço','restaurante para jantar'],'Comidas':['comida caseira','prato feito','restaurante para família']}},
 hotel:{title:'Hospedagem',clusters:{'Hospedagem':['hospedagem','onde se hospedar'],'Hotel':['hotel','hotel para casal'],'Pousada':['pousada','pousada romântica']}},
 imobiliaria:{title:'Imobiliárias',clusters:{'Imobiliária':['imobiliária','corretor de imóveis'],'Venda':['imóveis à venda','casas à venda','apartamentos à venda'],'Locação':['imóveis para alugar','casas para alugar','apartamentos para alugar']}},
 construcao:{title:'Materiais para construção',clusters:{'Construção':['materiais de construção','loja de materiais de construção'],'Hidráulica':['material hidráulico','loja de materiais hidráulicos'],'Elétrica':['material elétrico','loja de material elétrico']}},
 automotivo:{title:'Auto e moto',clusters:{'Peças':['loja de autopeças','loja de peças'],'Serviços':['oficina mecânica','revisão de veículos'],'Acessórios':['acessórios automotivos','loja de acessórios']}},
 generico:{title:'Produtos/serviços personalizados',clusters:{'Categoria principal':['loja','comprar produtos','comércio local']}}
};
export function suggestKeywords({city,niche,products=[]}){
 const base=categories[niche]||categories.generico;
 const location=norm(city).replace(/,\s*(MG|SP|RJ|ES|BA|PR|SC|RS|GO|DF|RO|AC|AM|RR|PA|TO|AP|MA|PI|CE|RN|PB|PE|AL|SE|MT|MS)\b/i,'');
 if(!location)return [];
 const terms=[];
 for(const [cluster,phrases] of Object.entries(base.clusters)){
  phrases.forEach((phrase,i)=>terms.push({query:`${phrase} em ${location}`,cluster,priority:i<2?'P1':'P2'}));
 }
 for(const product of products){
  const name=norm(product).slice(0,90);
  if(!name)continue;
  terms.push({query:`${name} em ${location}`,cluster:'Produtos e serviços informados',priority:'P1'});
  terms.push({query:`comprar ${name} em ${location}`,cluster:'Produtos e serviços informados',priority:'P2'});
 }
 const existing=new Set();
 return terms.filter(x=>{const k=x.query.toLowerCase();if(existing.has(k))return false;existing.add(k);return true;}).slice(0,100);
}
export function listNiches(){return Object.entries(categories).map(([value,o])=>({value,title:o.title}));}
