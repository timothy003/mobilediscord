/*
 * smoothscroll polyfill - v0.3.5
 * https://iamdustan.github.io/smoothscroll
 * 2016 (c) Dustan Kasten, Jeremias Menichelli - MIT License
 */

(function(w, d, undefined) {
  'use strict';

  /*
   * aliases
   * w: window global object
   * d: document
   * undefined: undefined
   */

  // polyfill
  function polyfill() {
    // return when scrollBehavior interface is supported
    if ('scrollBehavior' in d.documentElement.style) {
      return;
    }

    /*
     * globals
     */
    var Element = w.HTMLElement || w.Element;
    var SCROLL_TIME = 400;

    /*
     * object gathering original scroll methods
     */
    var original = {
      scroll: w.scroll || w.scrollTo,
      scrollBy: w.scrollBy,
      elScroll: Element.prototype.scroll || scrollElement,
      scrollIntoView: Element.prototype.scrollIntoView
    };

    /**
     * changes scroll position inside an element
     * @method scrollElement
     * @param {Number} x
     * @param {Number} y
     */
    function scrollElement(x, y) {
      this.scrollLeft = x;
      this.scrollTop = y;
    }

    /**
     * returns result of applying ease math function to a number
     * @method ease
     * @param {Number} k
     * @returns {Number}
     */
    function ease(k) {
      return 0.5 * (1 - Math.cos(Math.PI * k));
    }

    /**
     * indicates if a smooth behavior should be applied
     * @method shouldBailOut
     * @param {Number|Object} x
     * @returns {Boolean}
     */
    function shouldBailOut(x) {
      if (typeof x !== 'object'
            || x === null
            || x.behavior === undefined
            || x.behavior === 'auto'
            || x.behavior === 'instant') {
        // first arg not an object/null
        // or behavior is auto, instant or undefined
        return true;
      }

      if (typeof x === 'object'
            && x.behavior === 'smooth') {
        // first argument is an object and behavior is smooth
        return false;
      }

      // throw error when behavior is not supported
      throw new TypeError('behavior not valid');
    }

    /**
     * finds scrollable parent of an element
     * @method findScrollableParent
     * @param {Element} el
     * @returns {Element} el
     */
    function findScrollableParent(el) {
      while (el = el.parentElement) {
        if (el === d.body || (el.clientHeight < el.scrollHeight ||
          el.clientWidth < el.scrollWidth) && w.getComputedStyle(el, null).overflow !== 'visible')
          return el;
      }
      return null;
    }

    /**
     * scrolls window with a smooth behavior
     * @method smoothScroll
     * @param {Object|Node} el
     * @param {Number} x
     * @param {Number} y
     */
    function smoothScroll(el, x, y) {
      if ("msZoomTo" in el)
        return el.msZoomTo({ contentX: x, contentY: y, viewportX: 0, viewportY: 0 });
      w.requestAnimationFrame(time => {
        var scrollable;
        var startX;
        var startY;
        var method;
        var startTime = time;

        // define scroll context
        if (el === d.body) {
          scrollable = w;
          startX = w.scrollX || w.pageXOffset;
          startY = w.scrollY || w.pageYOffset;
          method = original.scroll;
        } else {
          scrollable = el;
          startX = el.scrollLeft;
          startY = el.scrollTop;
          method = scrollElement;
        }

        // scroll looping over a frame
        w.requestAnimationFrame(function step(time) {
          var value;
          var currentX;
          var currentY;
          var elapsed = (time - startTime) / SCROLL_TIME;

          // avoid elapsed times higher than one
          elapsed = elapsed > 1 ? 1 : elapsed;

          // apply easing to elapsed time
          value = ease(elapsed);

          currentX = startX + (x - startX) * value;
          currentY = startY + (y - startY) * value;

          method.call(scrollable, currentX, currentY);

          // scroll more if we have not reached our destination
          if (elapsed < 1) {
            w.requestAnimationFrame(step);
          }
        });
      });
    }

    /*
     * ORIGINAL METHODS OVERRIDES
     */

    // w.scroll and w.scrollTo
    w.scroll = w.scrollTo = function() {
      // avoid smooth behavior if not required
      if (shouldBailOut(arguments[0])) {
        original.scroll.call(
          w,
          arguments[0].left || arguments[0],
          arguments[0].top || arguments[1]
        );
        return;
      }

      // LET THE SMOOTHNESS BEGIN!
      smoothScroll.call(
        w,
        d.body,
        ~~arguments[0].left,
        ~~arguments[0].top
      );
    };

    // w.scrollBy
    w.scrollBy = function() {
      // avoid smooth behavior if not required
      if (shouldBailOut(arguments[0])) {
        original.scrollBy.call(
          w,
          arguments[0].left || arguments[0],
          arguments[0].top || arguments[1]
        );
        return;
      }

      // LET THE SMOOTHNESS BEGIN!
      smoothScroll.call(
        w,
        d.body,
        ~~arguments[0].left + (w.scrollX || w.pageXOffset),
        ~~arguments[0].top + (w.scrollY || w.pageYOffset)
      );
    };

    // Element.prototype.scroll and Element.prototype.scrollTo
    Element.prototype.scroll = Element.prototype.scrollTo = function() {
      // avoid smooth behavior if not required
      if (shouldBailOut(arguments[0])) {
        original.elScroll.call(
            this,
            arguments[0].left || arguments[0],
            arguments[0].top || arguments[1]
        );
        return;
      }

      var left = arguments[0].left;
      var top = arguments[0].top;

      // LET THE SMOOTHNESS BEGIN!
      smoothScroll.call(
          this,
          this,
          typeof left === 'number' ? left : this.scrollLeft,
          typeof top === 'number' ? top : this.scrollTop
      );
    };

    // Element.prototype.scrollBy
    Element.prototype.scrollBy = function() {
      var arg0 = arguments[0];

      if (typeof arg0 === 'object') {
        this.scroll({
          left: arg0.left + this.scrollLeft,
          top: arg0.top + this.scrollTop,
          behavior: arg0.behavior
        });
      } else {
        this.scroll(
          this.scrollLeft + arg0,
          this.scrollTop + arguments[1]
        );
      }
    };

    // Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function() {
      // avoid smooth behavior if not required
      if (shouldBailOut(arguments[0])) {
        original.scrollIntoView.call(this, arguments[0] || true);
        return;
      }

      // LET THE SMOOTHNESS BEGIN!
      var scrollableParent = this;
      var clientRects = this.getBoundingClientRect();
      while (scrollableParent = findScrollableParent(scrollableParent)) {
        var parentRects;
        if (scrollableParent === d.body)
          parentRects = {
            width: d.documentElement.clientWidth,
            height: d.documentElement.clientHeight,
            top: 0,
            right: d.documentElement.clientWidth,
            bottom: d.documentElement.clientHeight,
            left: 0
          };
        else
          parentRects = scrollableParent.getBoundingClientRect();

        let left = 0, top = 0;
        if (clientRects.left > parentRects.left || clientRects.right < parentRects.right)
          if (clientRects.left < parentRects.left && clientRects.width <= parentRects.width || clientRects.right > parentRects.right && clientRects.width >= parentRects.width)
            left = clientRects.left - parentRects.left;
          else if (clientRects.left < parentRects.left && clientRects.width >= parentRects.width || clientRects.right > parentRects.right && clientRects.width <= parentRects.width)
            left = clientRects.right - parentRects.right;
        if (clientRects.top > parentRects.top || clientRects.bottom < parentRects.bottom)
          if (clientRects.top < parentRects.top && clientRects.height <= parentRects.height || clientRects.bottom > parentRects.bottom && clientRects.height >= parentRects.height)
            top = clientRects.top - parentRects.top;
          else if (clientRects.top < parentRects.top && clientRects.height >= parentRects.height || clientRects.bottom > parentRects.bottom && clientRects.height <= parentRects.height)
            top = clientRects.bottom - parentRects.bottom;
        if (left || top) {
          if (scrollableParent !== d.body)
            // reveal element inside parent
            smoothScroll.call(
              this,
              scrollableParent,
              scrollableParent.scrollLeft + left,
              scrollableParent.scrollTop + top
            );
          else
            // reveal element in viewport
            w.scrollBy({
              left,
              top,
              behavior: 'smooth'
            });
          clientRects = {
            width: clientRects.width,
            height: clientRects.height,
            top: clientRects.top - top,
            right: clientRects.right - left,
            bottom: clientRects.bottom - top,
            left: clientRects.left - left
          };
        }
      }
    };
  }

  if (typeof exports === 'object') {
    // commonjs
    module.exports = { polyfill: polyfill };
  } else {
    // global
    polyfill();
  }
})(window, document);
