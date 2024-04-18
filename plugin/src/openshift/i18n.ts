import i18next from 'i18next';

// OpenShift comes with its own i18n object. Creating a dummy one to avoid import errors in Kiali code
i18next.init({});

export const i18n = i18next;
