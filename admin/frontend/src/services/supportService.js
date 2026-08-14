import api from "./api";

const BASE_URL = "/customer/support";

const supportService = {
  // Get all tickets
  async getTickets(status = "") {
    const params = status ? { params: { status } } : {};

    const res = await api.get(BASE_URL, params);
    return res.data;
  },

  // Get one ticket with conversation
  async getTicket(ticketId) {
    const res = await api.get(`${BASE_URL}/${ticketId}`);
    return res.data;
  },

  // Get customer's orders
  async getOrders() {
    const res = await api.get(`${BASE_URL}/orders`);
    return res.data;
  },

  // Create ticket
  async createTicket(payload) {
    const res = await api.post(BASE_URL, payload);
    return res.data;
  },

  // Reply with optional attachment
  async reply(ticketId, message, attachments = []) {
    const formData = new FormData();

    if (message?.trim()) {
      formData.append("message", message.trim());
    }

    attachments.forEach((file) => {
      formData.append("attachments", file);
    });

    const res = await api.post(`${BASE_URL}/${ticketId}/messages`, formData);

    return res.data;
  },

  // Close
  async close(ticketId) {
    const res = await api.put(`${BASE_URL}/${ticketId}/close`);

    return res.data;
  },
};

export default supportService;
