// Conservative item-level exclusions supplement the publisher's general license.
export function restrictedSourceText(html:string){
  if(/all rights reserved|republished with permission|not covered by.{0,100}creative commons/i.test(html))return true;
  if(/creativecommons\.org\/licenses\/(?:by-nc|by-nd)/i.test(html))return true;
  const attribution=html.match(/(?:originally|first) (?:published|appeared)[\s\S]{0,280}/ig)||[];
  return attribution.some(clause=>!/globalvoices\.org|Global Voices/i.test(clause));
}
