import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// This client is pre-configured with the base URL and security header
const internalApiClient = axios.create({
  baseURL: process.env.MAIN_API_URL,
  headers: { 'X-Internal-API-Key': process.env.INTERNAL_API_KEY }
});

export type ApiListItem = {
    _id: string;
    name: string;
};

// Fetches a list (like specialities) and returns it
const fetchList = async (endpoint: string): Promise<ApiListItem[]> => {
    console.log(`Fetching list from: ${endpoint}`);
    const response = await internalApiClient.get(`/api/internal/${endpoint}`);
    return response.data.data;
};

export const fetchAllLists = async (jobCategory: string, specialityId?: string) => {
    // Skills are always needed
    const skillsPromise = fetchList('skills');

    let subSpecialitiesPromise: Promise<ApiListItem[]> = Promise.resolve([]);
    let privilegesPromise: Promise<ApiListItem[]> = Promise.resolve([]);

    // Only fetch medical lists if the category is 'Medical' and an ID is provided
    if (jobCategory === 'Medical' && specialityId) {
        console.log(`Fetching filtered lists for specialityId: ${specialityId}`);
        subSpecialitiesPromise = fetchList(`subspecialities?specialityId=${specialityId}`);
        privilegesPromise = fetchList(`privileges?specialityId=${specialityId}`);
    } else {
        console.log("Non-medical candidate or no speciality provided. Skipping medical list fetch.");
    }
    
    const [skills, subSpecialities, privileges] = await Promise.all([
        skillsPromise,
        subSpecialitiesPromise,
        privilegesPromise
    ]);
    
    return { skills, subSpecialities, privileges };
};

export const postCandidateUpdates = async (candidateId: string, updatePayload: any): Promise<void> => {
    console.log(`Posting updates for candidate: ${candidateId}`);
    await internalApiClient.patch(`/api/internal/candidates/${candidateId}`, updatePayload);
};