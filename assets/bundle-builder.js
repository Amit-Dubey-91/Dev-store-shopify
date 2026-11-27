if (!customElements.get('bundle-builder')) {
  customElements.define(
    'bundle-builder',
    class BundleBuilder extends HTMLElement {
      constructor() {
        super();

        this.maxItems = parseInt(this.dataset.maxItems, 10) || 3;
        this.currencyIso = this.dataset.currencyIso || 'USD';
        this.locale = this.dataset.locale || 'en-US';
        this.cartAddUrl = this.dataset.cartAddUrl || `${window.routes?.cart_add_url || '/cart/add'}.js`;
        this.strings = this.parseStrings(this.dataset.strings);
        this.selectedItems = [];
        this.isSubmitting = false;

        this.slotsContainer = this.querySelector('[data-bundle-slots]');
        this.progressElement = this.querySelector('[data-bundle-progress]');
        this.totalElement = this.querySelector('[data-bundle-total]');
        this.statusElement = this.querySelector('[data-bundle-status]');
        this.submitButton = this.querySelector('[data-bundle-submit]');
        this.submitLabel = this.querySelector('[data-bundle-submit-label]');
        this.submitSpinner = this.submitButton?.querySelector('.loading__spinner');

        this.moneyFormatter = this.createMoneyFormatter();

        this.addEventListener('click', this.onClick.bind(this));
        this.addEventListener('change', this.onChange.bind(this));
      }

      parseStrings(rawStrings) {
        try {
          return rawStrings ? JSON.parse(rawStrings) : {};
        } catch {
          return {};
        }
      }

      createMoneyFormatter() {
        try {
          return new Intl.NumberFormat(this.locale, {
            style: 'currency',
            currency: this.currencyIso,
          });
        } catch {
          return null;
        }
      }

      formatMoney(cents) {
        const amount = (Number(cents) || 0) / 100;
        if (this.moneyFormatter) {
          return this.moneyFormatter.format(amount);
        }
        return `${this.currencyIso} ${amount.toFixed(2)}`;
      }

      onClick(event) {
        const selectBtn = event.target.closest('[data-bundle-select-btn]');
        if (selectBtn) {
          const card = selectBtn.closest('[data-bundle-card]');
          if (card) this.toggleCardSelection(card);
          return;
        }

        const removeBtn = event.target.closest('[data-bundle-remove]');
        if (removeBtn) {
          const productId = removeBtn.dataset.productId;
          if (productId) this.removeProduct(productId);
          return;
        }

        const submitBtn = event.target.closest('[data-bundle-submit]');
        if (submitBtn) {
          this.submitBundle();
        }
      }

      onChange(event) {
        const variantSelect = event.target.closest('[data-bundle-variant-select]');
        if (!variantSelect) return;

        const card = variantSelect.closest('[data-bundle-card]');
        const selectedOption = variantSelect.options[variantSelect.selectedIndex];
        if (!card || !selectedOption) return;

        const variantId = selectedOption.value;
        const price = parseInt(selectedOption.dataset.price, 10) || 0;
        const available = selectedOption.dataset.available === 'true';
        const variantTitle = selectedOption.dataset.variantTitle || '';

        card.dataset.variantId = variantId;
        card.dataset.price = String(price);
        card.dataset.available = String(available);
        card.dataset.variantTitle = variantTitle;

        const priceEl = card.querySelector('[data-bundle-card-price] .price-item');
        if (priceEl) {
          priceEl.textContent = selectedOption.dataset.formattedPrice || this.formatMoney(price);
        }

        const existingIndex = this.selectedItems.findIndex(
          (item) => item.productId === card.dataset.productId
        );
        if (existingIndex !== -1) {
          if (!available) {
            this.selectedItems.splice(existingIndex, 1);
          } else {
            this.selectedItems[existingIndex] = {
              ...this.selectedItems[existingIndex],
              variantId,
              variantTitle,
              price,
            };
          }
        }

        this.render();
      }

      toggleCardSelection(card) {
        this.clearStatus();

        const productId = card.dataset.productId;
        const existingIndex = this.selectedItems.findIndex((item) => item.productId === productId);

        if (existingIndex !== -1) {
          this.selectedItems.splice(existingIndex, 1);
          this.render();
          return;
        }

        if (this.selectedItems.length >= this.maxItems) {
          return;
        }

        if (card.dataset.available !== 'true' || !card.dataset.variantId) {
          return;
        }

        this.selectedItems.push({
          productId,
          variantId: card.dataset.variantId,
          title: card.dataset.productTitle || '',
          variantTitle: card.dataset.variantTitle || '',
          price: parseInt(card.dataset.price, 10) || 0,
          image: card.dataset.image || '',
        });

        this.render();
      }

      removeProduct(productId) {
        this.clearStatus();
        this.selectedItems = this.selectedItems.filter((item) => item.productId !== productId);
        this.render();
      }

      render() {
        this.renderCards();
        this.renderSlots();
        this.renderSummary();
      }

      renderCards() {
        const atLimit = this.selectedItems.length >= this.maxItems;
        const selectedIds = new Set(this.selectedItems.map((item) => item.productId));

        this.querySelectorAll('[data-bundle-card]').forEach((card) => {
          const isSelected = selectedIds.has(card.dataset.productId);
          const isAvailable = card.dataset.available === 'true';
          const btn = card.querySelector('[data-bundle-select-btn]');
          const label = card.querySelector('[data-bundle-btn-label]');

          card.classList.toggle('is-selected', isSelected);

          if (!btn || !label) return;

          btn.setAttribute('aria-pressed', String(isSelected));

          if (!isAvailable) {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            label.textContent = this.strings.soldOut || 'Sold out';
          } else if (isSelected) {
            btn.disabled = false;
            btn.removeAttribute('aria-disabled');
            label.textContent = this.strings.selectedProduct || 'Selected';
          } else {
            btn.disabled = atLimit;
            if (atLimit) {
              btn.setAttribute('aria-disabled', 'true');
            } else {
              btn.removeAttribute('aria-disabled');
            }
            label.textContent = this.strings.selectProduct || 'Add to bundle';
          }
        });
      }

      renderSlots() {
        if (!this.slotsContainer) return;

        this.slotsContainer.innerHTML = '';

        for (let i = 0; i < this.maxItems; i += 1) {
          const item = this.selectedItems[i];
          const li = document.createElement('li');

          if (!item) {
            li.className = 'bundle-builder__slot bundle-builder__slot--empty';
            const placeholder = document.createElement('span');
            placeholder.className = 'bundle-builder__slot-placeholder';
            placeholder.textContent = (this.strings.emptySlot || 'Slot [number]').replace(
              '[number]',
              String(i + 1)
            );
            li.appendChild(placeholder);
            this.slotsContainer.appendChild(li);
            continue;
          }

          li.className = 'bundle-builder__slot';

          if (item.image) {
            const img = document.createElement('img');
            img.className = 'bundle-builder__slot-thumb';
            img.src = item.image;
            img.alt = item.title;
            img.width = 48;
            img.height = 48;
            img.loading = 'lazy';
            li.appendChild(img);
          }

          const info = document.createElement('div');
          info.className = 'bundle-builder__slot-info';

          const titleEl = document.createElement('span');
          titleEl.className = 'bundle-builder__slot-title';
          titleEl.textContent = item.title;
          info.appendChild(titleEl);

          const metaEl = document.createElement('span');
          metaEl.className = 'bundle-builder__slot-meta';
          const formattedPrice = this.formatMoney(item.price);
          metaEl.textContent = item.variantTitle
            ? `${item.variantTitle} · ${formattedPrice}`
            : formattedPrice;
          info.appendChild(metaEl);

          li.appendChild(info);

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'bundle-builder__remove-btn';
          removeBtn.dataset.bundleRemove = '';
          removeBtn.dataset.productId = item.productId;
          removeBtn.setAttribute(
            'aria-label',
            (this.strings.removeProduct || 'Remove [title]').replace('[title]', item.title)
          );
          removeBtn.textContent = '×';
          li.appendChild(removeBtn);

          this.slotsContainer.appendChild(li);
        }
      }

      renderSummary() {
        const count = this.selectedItems.length;
        const totalCents = this.selectedItems.reduce((sum, item) => sum + item.price, 0);

        if (this.progressElement) {
          this.progressElement.textContent = (this.strings.slotsProgress || '[count] of [max] selected')
            .replace('[count]', String(count))
            .replace('[max]', String(this.maxItems));
        }

        if (this.totalElement) {
          this.totalElement.textContent = this.formatMoney(totalCents);
        }

        if (this.submitButton) {
          const canSubmit = count === this.maxItems && !this.isSubmitting;
          this.submitButton.disabled = !canSubmit;
          if (canSubmit) {
            this.submitButton.removeAttribute('aria-disabled');
          } else {
            this.submitButton.setAttribute('aria-disabled', 'true');
          }
        }
      }

      generateBundleId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          return `bundle_${window.crypto.randomUUID()}`;
        }
        return `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }

      setSubmitting(submitting) {
        this.isSubmitting = submitting;
        if (!this.submitButton) return;

        this.submitButton.classList.toggle('loading', submitting);
        if (this.submitSpinner) {
          this.submitSpinner.classList.toggle('hidden', !submitting);
        }
        if (this.submitLabel) {
          this.submitLabel.textContent = submitting
            ? this.strings.addingBundle || 'Adding bundle...'
            : this.strings.addBundle || 'Add Bundle to Cart';
        }
        this.renderSummary();
      }

      showStatus(message, type) {
        if (!this.statusElement) return;
        this.statusElement.textContent = message;
        this.statusElement.className = `bundle-builder__status bundle-builder__status--${type}`;
        this.statusElement.hidden = false;
      }

      clearStatus() {
        if (!this.statusElement) return;
        this.statusElement.textContent = '';
        this.statusElement.hidden = true;
      }

      async submitBundle() {
        if (this.isSubmitting) return;

        if (this.selectedItems.length !== this.maxItems) {
          this.showStatus(
            this.strings.selectThreeError || 'Please select 3 distinct products before adding to cart.',
            'error'
          );
          return;
        }

        this.clearStatus();
        this.setSubmitting(true);

        const bundleId = this.generateBundleId();
        const cartDrawer = document.querySelector('cart-drawer');
        const sections = cartDrawer
          ? cartDrawer.getSectionsToRender().map((section) => section.id)
          : ['cart-drawer', 'cart-icon-bubble'];

        const payload = {
          items: this.selectedItems.map((item) => ({
            id: Number(item.variantId),
            quantity: 1,
            properties: {
              _bundle_id: bundleId,
            },
          })),
          sections,
          sections_url: window.location.pathname,
        };

        try {
          const response = await fetch(this.cartAddUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json();

          if (!response.ok || data.status) {
            const errorMessage =
              data.description || data.message || this.strings.bundleError || 'Could not add bundle to cart.';
            if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'bundle-builder',
                errors: data.errors || errorMessage,
                message: errorMessage,
              });
            }
            this.showStatus(errorMessage, 'error');
            return;
          }

          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: 'bundle-builder',
              cartData: data,
            });
          }

          if (cartDrawer) {
            cartDrawer.setActiveElement(this.submitButton);
            if (cartDrawer.classList.contains('is-empty')) {
              cartDrawer.classList.remove('is-empty');
            }
            cartDrawer.renderContents(data);
          } else if (data.sections && data.sections['cart-icon-bubble']) {
            const bubble = document.getElementById('cart-icon-bubble');
            const parsed = new DOMParser().parseFromString(
              data.sections['cart-icon-bubble'],
              'text/html'
            );
            const updatedSection = parsed.querySelector('.shopify-section');
            if (bubble && updatedSection) {
              bubble.innerHTML = updatedSection.innerHTML;
            }
          }

          this.selectedItems = [];
          this.render();
          this.showStatus(
            this.strings.bundleAdded || 'Your 3-item bundle was added to the cart.',
            'success'
          );
        } catch (error) {
          console.error(error);
          this.showStatus(
            this.strings.bundleError || 'Could not add bundle to cart. Please try again.',
            'error'
          );
        } finally {
          this.setSubmitting(false);
        }
      }
    }
  );
}

