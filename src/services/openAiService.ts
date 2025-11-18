import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Stage 1: Extracts raw data and expertise from CV text
export const callStage1_ExtractCvData = async (cvTextChunk: string): Promise<any> => {
    console.log('Calling OpenAI Stage 1: Extraction...');
    //If a field is not found, omit it or use an empty array/null.
    const prompt = `
    You are an AI parsing a piece of a resume. Extract the following details if present in this text chunk.
    If a field does not have nullable values in the desired JSON Structure below, provide the best guess based on the text.
    Pay VERY CLOSE attention to the required data types.

    **Desired JSON Structure with Strict Types:**
    {
      "totalExp": "string (best guess between '0-2', '2-4', or '4+' ONLY)",
      "address": "string | null",
      "city": "string | null",
      "gender": "string | 'Male' | 'Female'",
      "workExperienceCountries": ["string"],
      "organizationDetails": [
        { "name": "string", "role": "string", "startWorkingDate": "YYYY-MM-DD format or null if not found", "endWorkingDate": "YYYY-MM-DD format or null if not found", "present": boolean }
      ],
      "education": [
        { 
          "highestEdu": "string", 
          "university": "string", 
          "graduation": "YYYY-MM-DD format or null if not found", 
          "degreeLevel": "string", 
          "startingYear": "number (YYYY format ONLY, e.g., 2021)", // <-- SPECIFIC INSTRUCTION
          "endingYear": "number (YYYY format ONLY, e.g., 2025)"   // <-- SPECIFIC INSTRUCTION
        }
      ],
      "rawExpertiseAndSkills": ["string"]
    }

    **CV Text Chunk:**
    """${cvTextChunk}"""

    Respond ONLY with the valid JSON object.
  `;


    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125", // Or another model that supports JSON mode -> gpt-4-1106-preview
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
};

// Stage 2: Matches extracted expertise against your DB lists
export const callStage2_MatchExpertise = async (
    rawExpertise: string[], 
    availableLists: any,
    jobCategory: string,
    preSelectedSpeciality?: { name: string }
): Promise<any> => {
    console.log('Calling OpenAI Stage 2 with strict matching limits...');
    let medicalSection = '';

    if (jobCategory === 'Medical' && preSelectedSpeciality) {
        medicalSection = `
          **Medical Context & STRICT RULES:**
          The candidate's primary speciality is "${preSelectedSpeciality.name}".
          1.  Select the **top 3 MOST RELEVANT** sub-specialities from the "Available Sub-Specialities" list. **IT IS CRITICAL THAT YOU RETURN NO MORE THAN 3.**
          2.  Select the **top 5 MOST RELEVANT** privileges from the "Available Privileges" list. **IT IS CRITICAL THAT YOU RETURN NO MORE THAN 5.**
          3.  **IMPORTANT RULE:** Ensure the number of sub-specialities you return is less than or equal to the number of privileges. If you find 3 privileges, you can return 1, 2, or 3 sub-specialities, but not more.

          **Available Sub-Specialities (for "${preSelectedSpeciality.name}"):**
          ${JSON.stringify(availableLists.subSpecialities)}

          **Available Privileges (for "${preSelectedSpeciality.name}"):**
          ${JSON.stringify(availableLists.privileges)}
        `;
    }

    const prompt = `
      You are an expert AI data mapper for medical professionals.

      ${medicalSection}

      **General Skills Context & STRICT RULE:**
        From the "Available Skills" list, select the **top 5 MOST RELEVANT** skills. **DO NOT EXCEED 10.**

      **Available Skills:**
      ${JSON.stringify(availableLists.skills)}

      **Candidate's Expertise to Analyze:**
      ${JSON.stringify(rawExpertise)}

      **Desired JSON Response Format:**
      {
        "matchedSubSpecialities": ["string"], // Max 3 items
        "matchedPrivileges": ["string"],     // Max 5 items
        "matchedSkills": ["string"]          // Max 5 items
      }
      Respond ONLY with the valid JSON object.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
};