import { inputElement, on, OnOptions } from "../util";

export interface ViewAttrs {
  el?: HTMLElement;
  model?: Model;
  tag?: string;
  class?: string;
  id?: string;
}

// Generic model class, that all other model classes extend
export class Model {
  public id: number;
}

// Generic view class, that all over view classes extend
// tslint:disable-next-line:max-classes-per-file
export default class View<M> {
  public model: M;
  public el: HTMLElement;
  public id: string | number;

  // Creates a new View and binds it to the target model, id any. If no
  // element supplied, creates a new one from the attributes.
  constructor({ el, model, tag, class: cls, id }: ViewAttrs) {
    if (model) {
      this.model = model as any;
    }
    if (!el) {
      this.el = document.createElement(tag || "div");
      if (id) {
        this.el.setAttribute("id", id);
        this.id = id;
      }
      if (cls) {
        this.el.setAttribute("class", cls);
      }
    } else {
      this.el = el;
      const elId = el.getAttribute("id");
      if (elId) {
        this.id = elId;
      }
    }
  }

  // Remove the from the DOM without causing a redraw
  public remove() {
    this.el.remove();
  }

  // Returns input element inside the view by name
  public inputElement(name: string): HTMLInputElement {
    return inputElement(this.el, name);
  }

  // Add  optionally selector-specific event listeners to the view
  protected on(type: string, fn: EventListener, opts?: OnOptions) {
    on(this.el, type, fn, opts);
  }

  // Shorthand for adding multiple click event listeners as an object.
  // We use those the most, so nice to have. Also prevents default behavior
  // from triggering.
  protected onClick(events: { [selector: string]: EventListener }) {
    for (const selector of Object.keys(events)) {
      this.on("click", events[selector], { selector, capture: true });
    }
  }
}
