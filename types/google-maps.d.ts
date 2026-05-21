/** Minimal typings for admin bookings monitor map. */
declare namespace google {
  namespace maps {
    class MVCObject {
      get(key: string): unknown
      set(key: string, value: unknown): void
    }

    class Point {
      constructor(x: number, y: number)
    }

    class Map {
      constructor(el: HTMLElement, opts?: MapOptions)
      fitBounds(bounds: LatLngBounds, padding?: number | Padding)
      getZoom(): number | undefined
      setZoom(z: number): void
    }

    class Marker {
      constructor(opts?: MarkerOptions)
      setMap(map: Map | null): void
      addListener(event: string, fn: () => void): void
    }

    class Polyline extends MVCObject {
      constructor(opts?: PolylineOptions)
      setMap(map: Map | null): void
    }

    class LatLngBounds {
      extend(point: LatLngLiteral): void
    }

    namespace event {
      function trigger(instance: object, eventName: string): void
    }

    namespace Animation {
      const BOUNCE: unknown
    }

    enum SymbolPath {
      CIRCLE,
      BACKWARD_CLOSED_ARROW,
      FORWARD_CLOSED_ARROW,
    }

    interface MapTypeStyle {
      featureType?: string
      elementType?: string
      stylers?: object[]
    }

    interface MapOptions {
      center?: LatLngLiteral
      zoom?: number
      mapTypeControl?: boolean
      streetViewControl?: boolean
      fullscreenControl?: boolean
      gestureHandling?: string
      styles?: MapTypeStyle[]
    }

    interface MarkerOptions {
      position?: LatLngLiteral
      map?: Map
      title?: string
      icon?: object
      zIndex?: number
      animation?: unknown
    }

    interface PolylineOptions {
      path?: LatLngLiteral[]
      geodesic?: boolean
      strokeColor?: string
      strokeOpacity?: number
      strokeWeight?: number
      map?: Map
      icons?: Array<{
        icon?: object
        offset?: string
        repeat?: string
      }>
    }

    interface LatLngLiteral {
      lat: number
      lng: number
    }

    interface Padding {
      top?: number
      right?: number
      bottom?: number
      left?: number
    }
  }
}

interface Window {
  google?: typeof google
}
