/** Source registry (§11.3, §14.5). Rendered on /sources; seeded into kb.sources by the pipeline. */
export interface SourceRecord {
  id: string;
  name: string;
  url: string;
  license: string;
  attribution: string;
  usedFor: string;
  tracks: ('mcat' | 'lsat' | 'boards' | 'bar' | 'all')[];
}

export const SOURCES: SourceRecord[] = [
  { id: 'enable', name: 'ENABLE word list', url: 'https://github.com/dolph/dictionary', license: 'Public domain', attribution: 'ENABLE2K word list (public domain).', usedFor: 'Valid guesses for Jargon', tracks: ['mcat', 'boards', 'bar'] },
  { id: 'nlm-clinicaltables', name: 'NLM Clinical Table Search Service', url: 'https://clinicaltables.nlm.nih.gov/', license: 'Free public service (NLM terms)', attribution: 'Condition names and synonyms courtesy of the U.S. National Library of Medicine.', usedFor: 'Diagnosis vocabulary and synonyms', tracks: ['boards'] },
  { id: 'mesh', name: 'Medical Subject Headings (MeSH)', url: 'https://www.nlm.nih.gov/mesh/', license: 'NLM MeSH terms and conditions', attribution: 'MeSH® courtesy of the U.S. National Library of Medicine.', usedFor: 'Disease hierarchy and system attributes, medical terms', tracks: ['boards'] },
  { id: 'rxnav', name: 'RxNorm / RxClass (RxNav)', url: 'https://rxnav.nlm.nih.gov/', license: 'Free; no license required (NLM terms). Some classes from SNOMED CT.', attribution: 'Drug class data from RxNav (not endorsed by NLM).', usedFor: 'Drug classes for Quartet and distractors', tracks: ['boards'] },
  { id: 'openfda', name: 'openFDA drug labeling', url: 'https://open.fda.gov/', license: 'CC0 1.0 (except where marked)', attribution: 'Data provided by the U.S. Food and Drug Administration.', usedFor: 'Pharmacology fact grounding', tracks: ['boards'] },
  { id: 'hpo', name: 'Human Phenotype Ontology', url: 'https://hpo.jax.org/', license: 'HPO license (attribution, unmodified content)', attribution: 'This service uses the Human Phenotype Ontology (version recorded at ingest). Köhler S et al., Nucleic Acids Res.', usedFor: 'Internal ranking of clue specificity (not displayed)', tracks: ['boards'] },
  { id: 'doid', name: 'Disease Ontology', url: 'https://disease-ontology.org/', license: 'CC0', attribution: 'Human Disease Ontology (CC0).', usedFor: 'Etiology classification cross-check', tracks: ['boards'] },
  { id: 'openstax', name: 'OpenStax textbooks (Biology 2e, Psychology 2e, Chemistry 2e, College Physics 2e, Anatomy & Physiology 2e, Introduction to Sociology 3e)', url: 'https://openstax.org/', license: 'CC BY 4.0', attribution: 'Access for free at openstax.org. © Rice University, CC BY 4.0. OpenStax name and logo not used.', usedFor: 'Grounding corpus for science explanations', tracks: ['mcat', 'boards'] },
  { id: 'pubchem', name: 'PubChem', url: 'https://pubchem.ncbi.nlm.nih.gov/', license: 'NCBI policies (largely public domain)', attribution: 'Chemical data from PubChem (NCBI).', usedFor: 'Molecule properties and SMILES', tracks: ['mcat'] },
  { id: 'uniprot', name: 'UniProt', url: 'https://www.uniprot.org/', license: 'CC BY 4.0', attribution: 'UniProt Consortium, CC BY 4.0.', usedFor: 'Enzyme function grounding', tracks: ['mcat'] },
  { id: 'wikidata', name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0', attribution: 'Structured data from Wikidata (CC0).', usedFor: 'Entity attributes and topic seeds', tracks: ['mcat', 'lsat'] },
  { id: 'federal-rules', name: 'Federal Rules of Evidence, Civil and Criminal Procedure; U.S. Constitution', url: 'https://www.uscourts.gov/rules-policies/current-rules-practice-procedure', license: 'U.S. government works (public domain)', attribution: 'Text from uscourts.gov and govinfo.gov.', usedFor: 'Primary-source citations', tracks: ['bar'] },
  { id: 'courtlistener', name: 'CourtListener (Free Law Project)', url: 'https://www.courtlistener.com/', license: 'Court opinions are public domain; API terms apply', attribution: 'Case metadata from CourtListener, a Free Law Project service.', usedFor: 'Landmark-case context', tracks: ['bar'] },
  { id: 'uscourts-glossary', name: 'U.S. Courts Glossary of Legal Terms', url: 'https://www.uscourts.gov/glossary', license: 'U.S. government work', attribution: 'Administrative Office of the U.S. Courts.', usedFor: 'Legal Jargon terms', tracks: ['bar'] },
];
