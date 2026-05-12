export const SECTION_TEMPLATES = {
  experience:     { fields: ['title', 'company', 'start_date', 'end_date', 'location', 'highlights'], listFields: ['highlights'] },
  education:      { fields: ['degree', 'institution', 'start_date', 'end_date', 'gpa'],              listFields: [] },
  skills:         { fields: ['category', 'items'],                                                    listFields: ['items'] },
  projects:       { fields: ['name', 'description', 'url', 'highlights'],                            listFields: ['highlights'] },
  certifications: { fields: ['name', 'issuer', 'date'],                                              listFields: [] },
  publications:   { fields: ['title', 'venue', 'date', 'url'],                                       listFields: [] },
  languages:      { fields: ['language', 'proficiency'],                                              listFields: [] },
  awards:         { fields: ['name', 'issuer', 'date'],                                              listFields: [] },
  extracurricular:{ fields: ['title', 'organization', 'date', 'highlights'],                         listFields: ['highlights'] },
};
