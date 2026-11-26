(() => {
  if (customElements.get('metaobject-page-builder')) return;

  class MetaobjectPageBuilder extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized === 'true') return;
      this.dataset.initialized = 'true';
    }
  }

  customElements.define('metaobject-page-builder', MetaobjectPageBuilder);
})();

