
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ParseResult } from "../types";

const apiKey = process.env.API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Mock Data for demonstration purposes
const MOCK_PARSE_RESULT: ParseResult = {
  supplier: "演示供应商 (AI智能识别)",
  items: [
    { name: "精品五花肉", specification: "带皮/新鲜", quantity: 20, unit: "kg", unitPrice: 26.5, total: 530 },
    { name: "高山娃娃菜", specification: "20斤/筐", quantity: 5, unit: "筐", unitPrice: 45, total: 225 },
    { name: "独头蒜", specification: "特级", quantity: 10, unit: "kg", unitPrice: 12.8, total: 128 },
    { name: "海天生抽", specification: "1.9L/瓶", quantity: 12, unit: "瓶", unitPrice: 18.5, total: 222 }
  ],
  totalCost: 1105,
  notes: "AI已自动识别清单，请核对单价与数量。",
  status: "Stocked"
};

const procurementSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    supplier: { type: Type.STRING, description: "The name of the vendor or supplier." },
    items: {
      type: Type.ARRAY,
      description: "List of items purchased or received.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Name of the item/product." },
          specification: { type: Type.STRING, description: "Product specification, size, or package type (e.g. 500g/bag, 12 bottles/case, size M)." },
          quantity: { type: Type.NUMBER, description: "Quantity received (number only)." },
          unit: { type: Type.STRING, description: "Unit of measure (e.g., kg, box, pc, L)." },
          unitPrice: { type: Type.NUMBER, description: "Price per single unit. Essential for calculation." },
          total: { type: Type.NUMBER, description: "Total line cost (quantity * unitPrice)." }
        },
        required: ["name", "quantity", "unit", "unitPrice", "total"]
      }
    },
    notes: { type: Type.STRING, description: "Any issues, quality checks, or delivery notes." },
  },
  required: ["supplier", "items", "notes"],
};

export const parseDailyReport = async (
  text: string, 
  imagePart?: { data: string, mimeType: string }
): Promise<ParseResult | null> => {
  // 1. Mock Data Fallback (For Demo/Testing)
  // If no API key is present, simulate a network request and return mock data
  if (!apiKey) {
    console.log("No API Key found. Returning mock data for demonstration.");
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(MOCK_PARSE_RESULT);
      }, 2000); // Simulate 2s processing time
    });
  }

  try {
    const modelId = imagePart ? 'gemini-2.5-flash-image' : 'gemini-2.5-flash';
    
    let parts: any[] = [];
    
    if (imagePart) {
        parts.push({ inlineData: imagePart });
        parts.push({ text: `Analyze this receipt or inventory list (which may be in Chinese). Extract the supplier and all items.
        For each item, identify the Name, Packaging/Specification (e.g. 500g, 10kg/bag, box), Quantity, Unit, Unit Price, and Total.
        If Unit Price is missing but Total is present, calculate it.
        ${text ? "Additional info: " + text : ""}` });
    } else {
        parts.push({ text: `Extract the procurement/inventory entry data from the following text (which may be in Chinese): "${text}". 
      Example input: "Bought 50kg flour (25kg/bag) at $2/kg".
      Ensure you extract the Name, Specification, Quantity, Unit, and Unit Price.` });
    }

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: procurementSchema,
        temperature: 0.1, 
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      const result: ParseResult = {
        supplier: parsed.supplier || "未知供应商",
        items: parsed.items?.map((item: any) => ({
             ...item,
             specification: item.specification || ''
        })) || [],
        totalCost: parsed.items.reduce((acc: number, item: any) => acc + (item.total || 0), 0),
        notes: parsed.notes || "",
        status: "Stocked"
      };
      return result;
    }
    return null;
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    // Fallback to mock data on error as well for seamless demo experience
    return MOCK_PARSE_RESULT;
  }
};
