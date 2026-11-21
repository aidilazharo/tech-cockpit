import type { ClassifiedField } from '../access/field-classes.js';

/** People's names in SADs, as three classified groups. */
export const SAD_APPLICATION_PEOPLE = 'sad.application-people';
export const SAD_API_PEOPLE = 'sad.api-people';
export const SAD_VERSION_PEOPLE = 'sad.version-people';

export const SAD_FIELDS: ClassifiedField[] = [
  {
    key: SAD_APPLICATION_PEOPLE,
    module: 'sad',
    label: "The application's people: business owner, application owner, manager, lead, product managers, portfolio leads",
    defaultClass: 'personal',
  },
  { key: SAD_API_PEOPLE, module: 'sad', label: 'API owners and business owners (API inventory)', defaultClass: 'personal' },
  { key: SAD_VERSION_PEOPLE, module: 'sad', label: 'Who started, submitted and approved a SAD version', defaultClass: 'personal' },
];
