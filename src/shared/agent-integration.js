export const INTEGRATION_TARGET_STORAGE_KEY = 'rednote-integration-target';
export const INTEGRATION_TARGETS = ['openclaw', 'hermes'];

const HERMES_DEFAULTS = {
  serviceBaseUrl: '',
  mcpServerName: 'rednote',
  toolName: 'resolve_rednote_media',
  preferredAgentId: 'bfxia',
  mcpScriptPath: '',
};

function normalizeTarget(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return INTEGRATION_TARGETS.includes(normalized) ? normalized : '';
}

function normalizeComparableConfig(input = {}, fallback = HERMES_DEFAULTS) {
  return {
    serviceBaseUrl: String(input.serviceBaseUrl ?? fallback.serviceBaseUrl ?? '').trim(),
    mcpServerName: String(input.mcpServerName ?? fallback.mcpServerName ?? '').trim(),
    toolName: String(input.toolName ?? fallback.toolName ?? '').trim(),
    preferredAgentId: String(input.preferredAgentId ?? fallback.preferredAgentId ?? '').trim(),
    mcpScriptPath: String(input.mcpScriptPath ?? fallback.mcpScriptPath ?? '').trim(),
  };
}

function isHermesConfigCustomized(config = {}) {
  const openclaw = normalizeComparableConfig(config?.openclaw || {}, HERMES_DEFAULTS);
  const hermes = normalizeComparableConfig(config?.hermes || {}, openclaw);

  return Object.entries(HERMES_DEFAULTS).some(([key, defaultValue]) => {
    const baselineValue = openclaw[key] || defaultValue;
    return hermes[key] !== String(baselineValue);
  });
}

export function resolveInitialIntegrationTarget({ storageValue = '', config = {} } = {}) {
  const savedTarget = normalizeTarget(storageValue);
  if (savedTarget) {
    return savedTarget;
  }

  if (isHermesConfigCustomized(config)) {
    return 'hermes';
  }

  return 'openclaw';
}

export function normalizeTemplateSlots(template = {}) {
  const slotDefs = [
    ['primary', 'snippetPrimaryLabel', 'snippetPrimary', 'snippetPrimaryCopyLabel'],
    ['secondary', 'snippetSecondaryLabel', 'snippetSecondary', 'snippetSecondaryCopyLabel'],
    ['tertiary', 'snippetTertiaryLabel', 'snippetTertiary', 'snippetTertiaryCopyLabel'],
  ];

  return slotDefs
    .map(([key, labelKey, valueKey, copyLabelKey]) => {
      const value = String(template[valueKey] || '');
      if (!value.trim()) {
        return null;
      }

      return {
        key,
        label: String(template[labelKey] || key),
        value,
        copyLabel: String(template[copyLabelKey] || ''),
      };
    })
    .filter(Boolean);
}
