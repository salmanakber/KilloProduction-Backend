"use client" // Required for animations in Next.js App Router

import React, { useState, useEffect } from 'react';
import { Utensils, Car, ShoppingBasket, Wrench, Pill, Package } from 'lucide-react';

export default function Loading( ) {
  const icons = [
    { icon: Utensils, color: "text-orange-500" },      // Food
    { icon: ShoppingBasket, color: "text-green-600" }, // Grocery
    { icon: Car, color: "text-blue-600" },             // Riding
    { icon: Package, color: "text-yellow-500" },       // Delivery
    { icon: Wrench, color: "text-gray-600" },          // Autoparts
    { icon: Pill, color: "text-red-500" },             // Pharmacy
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % icons.length);
    }, 800); // Change icon every 800ms
    return () => clearInterval(interval);
  }, []);

  const CurrentIcon = icons[currentIndex].icon;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white">
      <div className="relative flex items-center justify-center">
        {/* Spinning Outer Ring */}
        <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-green-600"></div>
        
        {/* Centered Icon */}
        <div className={`absolute transition-all duration-300 transform scale-100 ${icons[currentIndex].color}`}>
          <CurrentIcon size={32} strokeWidth={2.5} />
        </div>
      </div>
      
      {/* App Name */}
      <h1 className="mt-6 text-xl font-bold tracking-wider text-gray-800">
        KILLO <span className="text-green-600">SUPPER</span>
      </h1>
      <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest animate-pulse">
        Loading Services...
      </p>
    </div>
  )
}