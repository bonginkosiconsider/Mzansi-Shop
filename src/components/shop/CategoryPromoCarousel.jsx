import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const normalizeSlides = (slides = []) =>
  (Array.isArray(slides) ? slides : [])
    .map((slide, index) => {
      if (typeof slide === 'string') {
        const url = slide.trim();
        if (!url) return null;
        return {
          id: `promo-slide-${index}`,
          url,
          alt: ''
        };
      }

      const url = String(slide?.url || slide?.image || '').trim();
      if (!url) return null;

      return {
        id: slide?.storagePath || slide?.path || slide?.id || `promo-slide-${index}`,
        url,
        alt: String(slide?.alt || slide?.title || '').trim()
      };
    })
    .filter(Boolean);

export default function CategoryPromoCarousel({ categoryName, slides = [] }) {
  const promoSlides = useMemo(() => normalizeSlides(slides), [slides]);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultipleSlides = promoSlides.length > 1;

  useEffect(() => {
    setActiveIndex(0);
  }, [categoryName, promoSlides.length]);

  useEffect(() => {
    if (!hasMultipleSlides) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % promoSlides.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [hasMultipleSlides, promoSlides.length]);

  if (promoSlides.length === 0) {
    return null;
  }

  const showPreviousSlide = () => {
    setActiveIndex((current) => (current - 1 + promoSlides.length) % promoSlides.length);
  };

  const showNextSlide = () => {
    setActiveIndex((current) => (current + 1) % promoSlides.length);
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl bg-gray-100 shadow-sm">
      <div className="relative h-48 sm:h-56 lg:h-64">
        {promoSlides.map((slide, index) => (
          <Link
            key={slide.id}
            to={`/category/${encodeURIComponent(categoryName)}`}
            className={`absolute inset-0 block transition-opacity duration-700 ${
              index === activeIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <img
              src={slide.url}
              alt={slide.alt || `${categoryName} promotion ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
                New Arrivals
              </p>
              <h3 className="mt-2 max-w-xl text-2xl font-bold sm:text-3xl">{categoryName}</h3>
            </div>
          </Link>
        ))}
      </div>

      {hasMultipleSlides && (
        <>
          <button
            type="button"
            onClick={showPreviousSlide}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-900 shadow transition hover:bg-white"
            aria-label={`Show previous ${categoryName} promotion`}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={showNextSlide}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-900 shadow transition hover:bg-white"
            aria-label={`Show next ${categoryName} promotion`}
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur-sm">
            {promoSlides.map((slide, index) => (
              <button
                key={`${slide.id}-indicator`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  index === activeIndex ? 'bg-white' : 'bg-white/45 hover:bg-white/70'
                }`}
                aria-label={`Show ${categoryName} promotion ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
