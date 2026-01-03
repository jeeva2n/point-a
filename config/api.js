// src/config/api.js
// Centralized backend URL configuration

export const getBackendUrl = () => {
  return localStorage.getItem("backend_url") || "http://192.168.1.13:5002";
};

export const API_BASE_URL = getBackendUrl();

// Web3Forms Access Key
export const WEB3_ACCESS_KEY = "73a5d128-f5b6-4b66-80c6-bdac56b080c8";