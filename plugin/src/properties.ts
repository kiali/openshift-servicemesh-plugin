export const properties = {
    // This API is hardcoded but:
    // 'servicemesh' is the name of the plugin, it can be considered "fixed" in the project
    // 'plugin-config.json' is a resource mounted from a ConfigMap, so, the UI app can read config from that file
    pluginConfig: '/api/plugins/servicemesh/plugin-config.json',
}

// This Config type should be mapped with the 'plugin-config.json' file
export type Config = {
    kialiUrl: string;
}

export const kioskUrl = 'kiosk=true';










